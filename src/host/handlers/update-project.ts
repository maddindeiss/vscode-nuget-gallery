import { IRequestHandler } from "@/common/messaging/core/types";
import * as vscode from "vscode";
import ProjectParser from "../utilities/project-parser";
import TaskExecutor from "../utilities/task-executor";
import DirectoryPackagesParser from "../utilities/directory-packages-parser";
import fs from "fs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import xpath from "xpath";

export default class UpdateProject implements IRequestHandler<UpdateProjectRequest, UpdateProjectResponse> {
  async HandleAsync(request: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    let skipRestore = vscode.workspace.getConfiguration("NugetGallery").get<string>("skipRestore") ?? "";
    
    // Check if Central Package Management is enabled
    const isCPMEnabled = DirectoryPackagesParser.IsCentralPackageManagementEnabled(request.ProjectPath);
    
    if (isCPMEnabled && request.Type === "INSTALL") {
      // For CPM projects, use dotnet package update which handles CPM correctly
      await this.HandleCPMPackageUpdate(request, skipRestore);
    } else {
      // For non-CPM projects or uninstall, use the standard dotnet command
      await this.HandleStandardPackageUpdate(request, skipRestore);
    }

    let updatedProject = ProjectParser.Parse(request.ProjectPath);
    let result: UpdateProjectResponse = {
      Project: updatedProject,
    };
    return result;
  }

  private async HandleCPMPackageUpdate(request: UpdateProjectRequest, skipRestore: string): Promise<void> {
    // Check if PackageReference exists in project file
    const projectContent = fs.readFileSync(request.ProjectPath, "utf8");
    const document = new DOMParser().parseFromString(projectContent);
    
    const existingRefs = xpath.select(
      `//ItemGroup/PackageReference[@Include='${request.PackageId}']`,
      document
    ) as Node[];

    const packageExists = existingRefs.length > 0;

    if (!packageExists) {
      // For new packages, we need to add the version to Directory.Packages.props first
      // before adding the PackageReference to avoid NU1008 error
      const propsPath = DirectoryPackagesParser.FindDirectoryPackagesProps(request.ProjectPath);
      if (propsPath) {
        DirectoryPackagesParser.UpdatePackageVersion(
          request.ProjectPath,
          request.PackageId,
          request.Version!
        );
      }
      
      // Then add PackageReference without version to project file
      this.AddPackageReferenceWithoutVersion(request.ProjectPath, request.PackageId);
      
      // For new packages, run restore to make the package available
      if (!skipRestore) {
        let restoreArgs: Array<string> = ["restore", request.ProjectPath.replace(/\\/g, "/")];
        let restoreTask = new vscode.Task(
          { type: "dotnet", task: `dotnet restore` },
          vscode.TaskScope.Workspace,
          "nuget-gallery",
          "dotnet",
          new vscode.ShellExecution("dotnet", restoreArgs)
        );
        restoreTask.presentationOptions.reveal = vscode.TaskRevealKind.Silent;
        await TaskExecutor.ExecuteTask(restoreTask);
      }
    } else {
      // For existing packages, use dotnet package update to update the version
      let args: Array<string> = [
        "package", 
        "update", 
        request.PackageId,
        "--project",
        request.ProjectPath.replace(/\\/g, "/")
      ];

      // Specify the version if provided
      if (request.Version) {
        args.push("--version");
        args.push(request.Version);
      }

      if (skipRestore) {
        args.push("--no-restore");
      }

      let task = new vscode.Task(
        { type: "dotnet", task: `dotnet package update` },
        vscode.TaskScope.Workspace,
        "nuget-gallery",
        "dotnet",
        new vscode.ShellExecution("dotnet", args)
      );
      task.presentationOptions.reveal = vscode.TaskRevealKind.Silent;

      await TaskExecutor.ExecuteTask(task);
    }
  }

  private async HandleStandardPackageUpdate(request: UpdateProjectRequest, skipRestore: string): Promise<void> {
    let command = request.Type == "UNINSTALL" ? "remove" : "add";
    let args: Array<string> = [command, request.ProjectPath.replace(/\\/g, "/"), "package", request.PackageId];
    
    if (request.Type !== "UNINSTALL") {
      args.push("-v");
      args.push(request.Version!);
      if (skipRestore) args.push("--no-restore");
    }

    let task = new vscode.Task(
      { type: "dotnet", task: `dotnet add/remove package` },
      vscode.TaskScope.Workspace,
      "nuget-gallery",
      "dotnet",
      new vscode.ShellExecution("dotnet", args)
    );
    task.presentationOptions.reveal = vscode.TaskRevealKind.Silent;

    await TaskExecutor.ExecuteTask(task);
  }

  private AddPackageReferenceWithoutVersion(projectPath: string, packageId: string): void {
    const projectContent = fs.readFileSync(projectPath, "utf8");
    const document = new DOMParser().parseFromString(projectContent);
    
    // Find or create an ItemGroup
    let itemGroups = xpath.select("//ItemGroup", document) as Node[];
    let itemGroup: any;
    
    if (itemGroups.length > 0) {
      // Use the first ItemGroup that contains PackageReference elements
      for (const ig of itemGroups) {
        const prNodes = xpath.select("PackageReference", ig) as Node[];
        if (prNodes.length > 0) {
          itemGroup = ig;
          break;
        }
      }
      // If no ItemGroup with PackageReference, use the first one
      if (!itemGroup) {
        itemGroup = itemGroups[0];
      }
    } else {
      // Create new ItemGroup
      const projectNode = xpath.select("/Project", document)[0];
      if (!projectNode) {
        throw new Error("Invalid project file structure");
      }
      itemGroup = document.createElement("ItemGroup");
      projectNode.appendChild(document.createTextNode("\n  "));
      projectNode.appendChild(itemGroup);
      projectNode.appendChild(document.createTextNode("\n"));
    }

    // Create new PackageReference element without Version
    const newPackageRef = document.createElement("PackageReference");
    newPackageRef.setAttribute("Include", packageId);
    
    // Check if ItemGroup has existing children
    const hasExistingChildren = itemGroup.childNodes.length > 0;
    
    if (hasExistingChildren) {
      // Remove trailing whitespace from ItemGroup before adding new element
      const lastChild = itemGroup.lastChild;
      if (lastChild && lastChild.nodeType === 3 && /^\s+$/.test(lastChild.nodeValue)) {
        itemGroup.removeChild(lastChild);
      }
    }
    
    // Add with proper indentation
    itemGroup.appendChild(document.createTextNode("\n    "));
    itemGroup.appendChild(newPackageRef);
    itemGroup.appendChild(document.createTextNode("\n  "));

    // Serialize and write back
    const serializer = new XMLSerializer();
    const updatedContent = serializer.serializeToString(document);
    fs.writeFileSync(projectPath, updatedContent, "utf8");
  }
}
