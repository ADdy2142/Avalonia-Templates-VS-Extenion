import { TemplateType } from "./template-type";

type ChangeFileContentType = {
  filePath: string;
  startContent: string;
  endContent: string;
  templateType: TemplateType;
  namespace: string;
  shortNamespace: string;
  openFile: boolean;
  isBackendFile: boolean;
};

export { ChangeFileContentType };
