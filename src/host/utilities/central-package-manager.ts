import fs from "fs";
import * as path from "path";
import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";

export default class CentralPackageManager {
  /**
   * Find Directory.Packages.props file by searching from project directory upwards
   */
  static FindDirectoryPackagesProps(projectPath: string): string | null {
    let currentDir = path.dirname(projectPath);
    
    // Search up to 5 levels up from the project directory
    for (let i = 0; i < 5; i++) {
      const propsPath = path.join(currentDir, "Directory.Packages.props");
      if (fs.existsSync(propsPath)) {
        return propsPath;
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached root directory
        break;
      }
      currentDir = parentDir;
    }
    
    return null;
  }

  /**
   * Check if Central Package Management is enabled for a project
   */
  static IsCentralPackageManagementEnabled(projectPath: string): boolean {
    const propsPath = this.FindDirectoryPackagesProps(projectPath);
    if (!propsPath) {
      return false;
    }

    try {
      const content = fs.readFileSync(propsPath, "utf8");
      const document = new DOMParser().parseFromString(content);
      
      // Check if ManagePackageVersionsCentrally is set to true
      const manageCentrallyNode = xpath.select(
        "string(//PropertyGroup/ManagePackageVersionsCentrally)",
        document
      );
      
      return manageCentrallyNode === "true";
    } catch (error) {
      console.error(`Error reading Directory.Packages.props: ${error}`);
      return false;
    }
  }

  /**
   * Parse Directory.Packages.props and extract package versions
   */
  static ParsePackageVersions(propsPath: string): Map<string, string> {
    const versions = new Map<string, string>();
    
    try {
      const content = fs.readFileSync(propsPath, "utf8");
      const document = new DOMParser().parseFromString(content);
      
      const packageVersions = xpath.select(
        "//ItemGroup/PackageVersion",
        document
      ) as Node[];
      
      packageVersions.forEach((node: any) => {
        const include = node.attributes?.getNamedItem("Include")?.value;
        let version = node.attributes?.getNamedItem("Version")?.value;
        
        if (!version) {
          version = xpath.select("string(Version)", node) as string;
        }
        
        if (include && version) {
          versions.set(include, version);
        }
      });
    } catch (error) {
      console.error(`Error parsing Directory.Packages.props: ${error}`);
    }
    
    return versions;
  }

  /**
   * Get version for a specific package from Directory.Packages.props
   */
  static GetPackageVersion(projectPath: string, packageId: string): string | null {
    const propsPath = this.FindDirectoryPackagesProps(projectPath);
    if (!propsPath) {
      return null;
    }
    
    const versions = this.ParsePackageVersions(propsPath);
    return versions.get(packageId) || null;
  }
}
