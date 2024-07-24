import { TemplateType } from "./template-type";

type ChangeNamespaceType = {
  templateType: TemplateType;
  createPath: string;
  projectPath: string;
  fileName: string;
  frontendModifiedStartContent: string;
  frontendModifiedEndContent: string;
  backendModifiedStartContent: string;
  backendModifiedEndContent: string;
};

export { ChangeNamespaceType };
