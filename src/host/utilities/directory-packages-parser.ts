import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";
import * as path from "path";

export default class DirectoryPackagesParser {
  /**
   * Finds the Directory.Packages.props file by searching up the directory tree
   * from the given project path
   */
  static FindDirectoryPackagesProps(projectPath: string): string | null {
    let currentDir = path.dirname(projectPath);
    const root = path.parse(currentDir).root;

    // Search up the directory tree
    while (currentDir !== root) {
      const propsPath = path.join(currentDir, "Directory.Packages.props");
      if (fs.existsSync(propsPath)) {
        return propsPath;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Reached the root
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Parses Directory.Packages.props and returns a map of package ID to version
   */
  static ParsePackageVersions(propsPath: string): Map<string, string> {
    const packageVersions = new Map<string, string>();

    try {
      const propsContent = fs.readFileSync(propsPath, "utf8");
      const document = new DOMParser().parseFromString(propsContent);
      if (!document) {
        return packageVersions;
      }

      // Check if CPM is enabled
      const manageCentrally = xpath.select(
        "string(//PropertyGroup/ManagePackageVersionsCentrally)",
        document
      ) as string;
      
      if (manageCentrally && manageCentrally.toLowerCase() !== "true") {
        return packageVersions;
      }

      // Parse PackageVersion items
      const packageVersionNodes = xpath.select(
        "//ItemGroup/PackageVersion",
        document
      ) as Node[];

      packageVersionNodes.forEach((node: any) => {
        const includeAttr = node.attributes?.getNamedItem("Include");
        const versionAttr = node.attributes?.getNamedItem("Version");

        if (includeAttr && versionAttr) {
          packageVersions.set(includeAttr.value, versionAttr.value);
        }
      });
    } catch (error) {
      console.error(`Error parsing Directory.Packages.props: ${error}`);
    }

    return packageVersions;
  }

  /**
   * Gets the version for a package from Directory.Packages.props
   */
  static GetPackageVersion(projectPath: string, packageId: string): string | null {
    const propsPath = this.FindDirectoryPackagesProps(projectPath);
    if (!propsPath) {
      return null;
    }

    const packageVersions = this.ParsePackageVersions(propsPath);
    return packageVersions.get(packageId) || null;
  }

  /**
   * Checks if a project is using Central Package Management
   */
  static IsCentralPackageManagementEnabled(projectPath: string): boolean {
    const propsPath = this.FindDirectoryPackagesProps(projectPath);
    if (!propsPath) {
      return false;
    }

    try {
      const propsContent = fs.readFileSync(propsPath, "utf8");
      const document = new DOMParser().parseFromString(propsContent);
      if (!document) {
        return false;
      }

      const manageCentrally = xpath.select(
        "string(//PropertyGroup/ManagePackageVersionsCentrally)",
        document
      ) as string;
      
      return !!manageCentrally && manageCentrally.toLowerCase() === "true";
    } catch (error) {
      return false;
    }
  }
}
