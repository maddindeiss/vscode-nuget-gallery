import fs from "fs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
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

  /**
   * Updates or adds a package version in Directory.Packages.props
   */
  static UpdatePackageVersion(projectPath: string, packageId: string, version: string): boolean {
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

      // Find existing PackageVersion node for this package
      const packageVersionNodes = xpath.select(
        `//ItemGroup/PackageVersion[@Include='${packageId}']`,
        document
      ) as Node[];

      if (packageVersionNodes.length > 0) {
        // Update existing package version
        const node = packageVersionNodes[0] as any;
        const versionAttr = node.attributes?.getNamedItem("Version");
        if (versionAttr) {
          versionAttr.value = version;
        } else {
          // Add Version attribute if it doesn't exist
          node.setAttribute("Version", version);
        }
      } else {
        // Add new PackageVersion entry
        // Find or create an ItemGroup
        let itemGroups = xpath.select("//ItemGroup", document) as Node[];
        let itemGroup: any;
        
        if (itemGroups.length > 0) {
          // Use the first ItemGroup that contains PackageVersion elements
          for (const ig of itemGroups) {
            const pvNodes = xpath.select("PackageVersion", ig) as Node[];
            if (pvNodes.length > 0) {
              itemGroup = ig;
              break;
            }
          }
          // If no ItemGroup with PackageVersion, use the first one
          if (!itemGroup) {
            itemGroup = itemGroups[0];
          }
        } else {
          // Create new ItemGroup
          const projectNode = xpath.select("/Project", document)[0];
          if (!projectNode) {
            return false;
          }
          itemGroup = document.createElement("ItemGroup");
          projectNode.appendChild(document.createTextNode("\n  "));
          projectNode.appendChild(itemGroup);
          projectNode.appendChild(document.createTextNode("\n"));
        }

        // Create new PackageVersion element
        const newPackageVersion = document.createElement("PackageVersion");
        newPackageVersion.setAttribute("Include", packageId);
        newPackageVersion.setAttribute("Version", version);
        
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
        itemGroup.appendChild(newPackageVersion);
        itemGroup.appendChild(document.createTextNode("\n  "));
      }

      // Serialize and write back
      const serializer = new XMLSerializer();
      const updatedContent = serializer.serializeToString(document);
      fs.writeFileSync(propsPath, updatedContent, "utf8");

      return true;
    } catch (error) {
      console.error(`Error updating Directory.Packages.props: ${error}`);
      return false;
    }
  }
}
