type UpdateType = "INSTALL" | "UNINSTALL" | "UPDATE";

type UpdateProjectRequest = {
  ProjectPath: string;
  PackageId: string;
  Version?: string;
  Type: UpdateType;
};

type UpdateProjectResponse = {
  Project: Project;
};
