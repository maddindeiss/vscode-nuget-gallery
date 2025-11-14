import { IRequestHandler } from "@/common/messaging/core/types";
import * as vscode from "vscode";
import ProjectParser from "../utilities/project-parser";
import TaskExecutor from "../utilities/task-executor";
import CentralPackageManager from "../utilities/central-package-manager";

export default class UpdateProject implements IRequestHandler<UpdateProjectRequest, UpdateProjectResponse> {
  async HandleAsync(request: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    let skipRestore = vscode.workspace.getConfiguration("NugetGallery").get<string>("skipRestore") ?? "";
    const isCpmEnabled = CentralPackageManager.IsCentralPackageManagementEnabled(request.ProjectPath);
    
    let args: Array<string> = [];
    
    if (request.Type === "UNINSTALL") {
      // dotnet remove <PROJECT> package <PACKAGE_ID>
      args = ["remove", request.ProjectPath.replace(/\\/g, "/"), "package", request.PackageId];
    } else if (request.Type === "UPDATE") {
      // Try to use new dotnet package update command (available since .NET 10)
      // dotnet package update <PROJECT> <PACKAGE_ID> --version <VERSION>
      args = ["package", "update", request.ProjectPath.replace(/\\/g, "/"), request.PackageId];
      if (request.Version) {
        args.push("--version");
        args.push(request.Version);
      }
      if (skipRestore) args.push("--no-restore");
    } else {
      // INSTALL: dotnet add <PROJECT> package <PACKAGE_ID> --version <VERSION>
      args = ["add", request.ProjectPath.replace(/\\/g, "/"), "package", request.PackageId];
      if (request.Version) {
        args.push("--version");
        args.push(request.Version);
      }
      // Only use --no-restore if skipRestore is enabled AND CPM is NOT enabled
      // When CPM is enabled, --no-restore causes a bug where version is added to csproj
      if (skipRestore && !isCpmEnabled) {
        args.push("--no-restore");
      }
    }

    let task = new vscode.Task(
      { type: "dotnet", task: `dotnet package operation` },
      vscode.TaskScope.Workspace,
      "nuget-gallery",
      "dotnet",
      new vscode.ShellExecution("dotnet", args)
    );
    task.presentationOptions.reveal = vscode.TaskRevealKind.Silent;

    try {
      await TaskExecutor.ExecuteTask(task);
    } catch (error) {
      // If "dotnet package update" fails (e.g., .NET version < 10), fall back to remove + add
      if (request.Type === "UPDATE") {
        console.log("dotnet package update failed, falling back to remove + add");
        
        // First remove the package
        const removeArgs = ["remove", request.ProjectPath.replace(/\\/g, "/"), "package", request.PackageId];
        const removeTask = new vscode.Task(
          { type: "dotnet", task: `dotnet remove package` },
          vscode.TaskScope.Workspace,
          "nuget-gallery",
          "dotnet",
          new vscode.ShellExecution("dotnet", removeArgs)
        );
        removeTask.presentationOptions.reveal = vscode.TaskRevealKind.Silent;
        await TaskExecutor.ExecuteTask(removeTask);
        
        // Then add it back with new version
        const addArgs = ["add", request.ProjectPath.replace(/\\/g, "/"), "package", request.PackageId];
        if (request.Version) {
          addArgs.push("--version");
          addArgs.push(request.Version);
        }
        // Same logic: don't use --no-restore with CPM
        if (skipRestore && !isCpmEnabled) {
          addArgs.push("--no-restore");
        }
        const addTask = new vscode.Task(
          { type: "dotnet", task: `dotnet add package` },
          vscode.TaskScope.Workspace,
          "nuget-gallery",
          "dotnet",
          new vscode.ShellExecution("dotnet", addArgs)
        );
        addTask.presentationOptions.reveal = vscode.TaskRevealKind.Silent;
        await TaskExecutor.ExecuteTask(addTask);
      } else {
        throw error;
      }
    }

    let updatedProject = ProjectParser.Parse(request.ProjectPath);
    let result: UpdateProjectResponse = {
      Project: updatedProject,
    };
    return result;
  }
}
