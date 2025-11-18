import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";
import * as path from "path";
import CentralPackageManager from "./central-package-manager";

export default class ProjectParser {
  static Parse(projectPath: string): Project {
    let projectContent = fs.readFileSync(projectPath, "utf8");
    let document = new DOMParser().parseFromString(projectContent);
    if (document == undefined) throw `${projectPath} has invalid content`;

    let packagesReferences = xpath.select("//ItemGroup/PackageReference", document) as Node[];
    let project: Project = {
      Path: projectPath,
      Name: path.basename(projectPath),
      Packages: Array(),
    };

    // Check if Central Package Management is enabled
    const isCpmEnabled = CentralPackageManager.IsCentralPackageManagementEnabled(projectPath);
    const propsPath = isCpmEnabled ? CentralPackageManager.FindDirectoryPackagesProps(projectPath) : null;
    const centralVersions = propsPath ? CentralPackageManager.ParsePackageVersions(propsPath) : null;

    (packagesReferences || []).forEach((p: any) => {
      const packageId = p.attributes?.getNamedItem("Include").value;
      let version = p.attributes?.getNamedItem("Version");
      if (version) {
        version = version.value;
      } else {
        version = xpath.select("string(Version)", p);
        if (!version) {
          version = null;
        }
      }
      
      // If version is not in csproj but CPM is enabled, get it from Directory.Packages.props
      if (!version && centralVersions && packageId) {
        version = centralVersions.get(packageId) || null;
      }
      
      let projectPackage: ProjectPackage = {
        Id: packageId,
        Version: version,
      };
      project.Packages.push(projectPackage);
    });

    return project;
  }
}
