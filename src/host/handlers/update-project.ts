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
      // For CPM projects, handle install/update differently
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
    // Step 1: Update Directory.Packages.props with the new version
    const updated = DirectoryPackagesParser.UpdatePackageVersion(
      request.ProjectPath,
      request.PackageId,
      request.Version!
    );

    if (!updated) {
      throw new Error(`Failed to update Directory.Packages.props for package ${request.PackageId}`);
    }

    // Step 2: Check if PackageReference exists in project file
    const projectContent = fs.readFileSync(request.ProjectPath, "utf8");
    const document = new DOMParser().parseFromString(projectContent);
    
    const existingRefs = xpath.select(
      `//ItemGroup/PackageReference[@Include='${request.PackageId}']`,
      document
    ) as Node[];

    if (existingRefs.length === 0) {
      // Step 3: If PackageReference doesn't exist, add it WITHOUT version
      this.AddPackageReferenceWithoutVersion(request.ProjectPath, request.PackageId);
    } else {
      // Step 4: If PackageReference exists, ensure it has NO version attribute
      this.RemoveVersionFromPackageReference(request.ProjectPath, request.PackageId);
    }

    // Step 5: Run dotnet restore if needed
    if (!skipRestore) {
      let args: Array<string> = ["restore", request.ProjectPath.replace(/\\/g, "/")];
      let task = new vscode.Task(
        { type: "dotnet", task: `dotnet restore` },
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
    
    // Add with proper indentation
    itemGroup.appendChild(document.createTextNode("\n    "));
    itemGroup.appendChild(newPackageRef);
    itemGroup.appendChild(document.createTextNode("\n  "));

    // Serialize and write back
    const serializer = new XMLSerializer();
    const updatedContent = serializer.serializeToString(document);
    fs.writeFileSync(projectPath, updatedContent, "utf8");
  }

  private RemoveVersionFromPackageReference(projectPath: string, packageId: string): void {
    const projectContent = fs.readFileSync(projectPath, "utf8");
    const document = new DOMParser().parseFromString(projectContent);
    
    const packageRefs = xpath.select(
      `//ItemGroup/PackageReference[@Include='${packageId}']`,
      document
    ) as Node[];

    let modified = false;
    packageRefs.forEach((node: any) => {
      const versionAttr = node.attributes?.getNamedItem("Version");
      if (versionAttr) {
        node.removeAttribute("Version");
        modified = true;
      }
    });

    if (modified) {
      const serializer = new XMLSerializer();
      const updatedContent = serializer.serializeToString(document);
      fs.writeFileSync(projectPath, updatedContent, "utf8");
    }
  }
}
