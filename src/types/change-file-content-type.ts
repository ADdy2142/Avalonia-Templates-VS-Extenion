import { TemplateType } from "./template-type";

type ChangeFileContentType = {
  filePath: string;
  startContent: string;
  endContent: string;
  templateType: TemplateType;
  xamlNameSpace: string;
  csharpNameSpace: string;
  openFile: boolean;
  isCSharpFile: boolean;
};

export { ChangeFileContentType };
