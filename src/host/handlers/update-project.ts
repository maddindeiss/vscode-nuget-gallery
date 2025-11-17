import { IRequestHandler } from "@/common/messaging/core/types";
import * as vscode from "vscode";
import ProjectParser from "../utilities/project-parser";
import TaskExecutor from "../utilities/task-executor";
import CentralPackageManager from "../utilities/central-package-manager";

export default class UpdateProject implements IRequestHandler<UpdateProjectRequest, UpdateProjectResponse> {
  async HandleAsync(request: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    let skipRestore = vscode.workspace.getConfiguration("NugetGallery").get<string>("skipRestore") ?? "";
    const isCpmEnabled = CentralPackageManager.IsCentralPackageManagementEnabled(request.ProjectPath);
    
    if (request.Type === "UNINSTALL") {
      // .NET 10 format: dotnet package remove <PACKAGE_ID> <PROJECT>
      const args = ["package", "remove", request.PackageId, request.ProjectPath.replace(/\\/g, "/")];
      const task = new vscode.Task(
        { type: "dotnet", task: `dotnet package remove` },
        vscode.TaskScope.Workspace,
        "nuget-gallery",
        "dotnet",
        new vscode.ShellExecution("dotnet", args)
      );
      task.presentationOptions.reveal = vscode.TaskRevealKind.Silent;
      await TaskExecutor.ExecuteTask(task);
    } else if (request.Type === "UPDATE") {
      // For UPDATE (including downgrades), use remove + add approach
      // This is more reliable than `dotnet package update` which may not support downgrades
      
      // First remove the package using .NET 10 format
      const removeArgs = ["package", "remove", request.PackageId, request.ProjectPath.replace(/\\/g, "/")];
      const removeTask = new vscode.Task(
        { type: "dotnet", task: `dotnet package remove` },
        vscode.TaskScope.Workspace,
        "nuget-gallery",
        "dotnet",
        new vscode.ShellExecution("dotnet", removeArgs)
      );
      removeTask.presentationOptions.reveal = vscode.TaskRevealKind.Silent;
      await TaskExecutor.ExecuteTask(removeTask);
      
      // Then add it back with new version using .NET 10 format
      const addArgs = ["package", "add", request.PackageId, request.ProjectPath.replace(/\\/g, "/")];
      if (request.Version) {
        addArgs.push("--version");
        addArgs.push(request.Version);
      }
      // Same logic: don't use --no-restore with CPM
      if (skipRestore && !isCpmEnabled) {
        addArgs.push("--no-restore");
      }
      const addTask = new vscode.Task(
        { type: "dotnet", task: `dotnet package add` },
        vscode.TaskScope.Workspace,
        "nuget-gallery",
        "dotnet",
        new vscode.ShellExecution("dotnet", addArgs)
      );
      addTask.presentationOptions.reveal = vscode.TaskRevealKind.Silent;
      await TaskExecutor.ExecuteTask(addTask);
    } else {
      // INSTALL: .NET 10 format: dotnet package add <PACKAGE_ID> <PROJECT> --version <VERSION>
      const args = ["package", "add", request.PackageId, request.ProjectPath.replace(/\\/g, "/")];
      if (request.Version) {
        args.push("--version");
        args.push(request.Version);
      }
      // Only use --no-restore if skipRestore is enabled AND CPM is NOT enabled
      // When CPM is enabled, --no-restore causes a bug where version is added to csproj
      if (skipRestore && !isCpmEnabled) {
        args.push("--no-restore");
      }
      const task = new vscode.Task(
        { type: "dotnet", task: `dotnet package add` },
        vscode.TaskScope.Workspace,
        "nuget-gallery",
        "dotnet",
        new vscode.ShellExecution("dotnet", args)
      );
      task.presentationOptions.reveal = vscode.TaskRevealKind.Silent;
      await TaskExecutor.ExecuteTask(task);
    }

    let updatedProject = ProjectParser.Parse(request.ProjectPath);
    let result: UpdateProjectResponse = {
      Project: updatedProject,
    };
    return result;
  }
}
