import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as path from "path";
import * as fs from "fs";

export function activate(context: vscode.ExtensionContext) {
  const windowDisposable = vscode.commands.registerCommand("avalonia-templates.createWindow", (args: any) => {
    createTemplate({
      templateType: TemplateType.Window,
      fsPath: args?.fsPath,
    });
  });

  const userControlDisposable = vscode.commands.registerCommand("avalonia-templates.createUserControl", (args: any) => {
    createTemplate({
      templateType: TemplateType.UserControl,
      fsPath: args?.fsPath,
    });
  });

  const templatedControlDisposable = vscode.commands.registerCommand(
    "avalonia-templates.createTemplatedControl",
    (args: any) => {
      createTemplate({
        templateType: TemplateType.TemplatedControl,
        fsPath: args?.fsPath,
      });
    }
  );

  const stylesDisposable = vscode.commands.registerCommand("avalonia-templates.createStyles", (args: any) => {
    createTemplate({
      templateType: TemplateType.Styles,
      fsPath: args?.fsPath,
    });
  });

  const resourceDictionaryDisposable = vscode.commands.registerCommand(
    "avalonia-templates.createResourceDictionary",
    (args: any) => {
      createTemplate({
        templateType: TemplateType.ResourceDictionary,
        fsPath: args?.fsPath,
      });
    }
  );

  context.subscriptions.push(
    windowDisposable,
    userControlDisposable,
    templatedControlDisposable,
    stylesDisposable,
    resourceDictionaryDisposable
  );
}

export function deactivate() {}

enum TemplateType {
  Window = 0,
  UserControl,
  TemplatedControl,
  Styles,
  ResourceDictionary,
}

type CreateTemplateType = {
  templateType: TemplateType;
  fsPath: any;
};

async function createTemplate(args: CreateTemplateType) {
  let type = "";
  switch (args.templateType) {
    case TemplateType.Window: {
      type = "Window";
      break;
    }

    case TemplateType.UserControl: {
      type = "UserControl";
      break;
    }

    case TemplateType.TemplatedControl: {
      type = "TemplatedControl";
      break;
    }

    case TemplateType.Styles: {
      type = "Styles";
      break;
    }

    case TemplateType.ResourceDictionary: {
      type = "ResourceDictionary";
      break;
    }
  }

  const fileName = await vscode.window.showInputBox({
    placeHolder: `Choose name for ${type}`,
  });

  if (!fileName) {
    vscode.window.showErrorMessage("Please choose a name 🫠");
    return;
  }

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Avalonia UI Templates",
    },
    (progress, token) => {
      return new Promise<void>((resolve, reject) => {
        const projectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "";
        let createPath = (args.fsPath as string) ?? projectPath;
        if (!createPath) {
          vscode.window.showErrorMessage("Can't create template 🥲");
          reject();
          return;
        }

        progress.report({
          message: "Creating your template",
          increment: 30,
        });

        const command = `dotnet new avalonia.${
          type.toLowerCase() === "ResourceDictionary".toLowerCase() ? "resource" : type.toLowerCase()
        } --name ${fileName}`;

        childProcess.exec(command, { cwd: createPath }, (error) => {
          if (error) {
            vscode.window.showErrorMessage(`Error creating file: ${error.message}`);
            reject();
            return;
          }

          progress.report({
            message: "Changing namespaces",
            increment: 60,
          });

          switch (args.templateType) {
            case TemplateType.Window:
            case TemplateType.UserControl:
            case TemplateType.TemplatedControl: {
              changeNamespace({
                templateType: args.templateType,
                createPath: createPath,
                projectPath: projectPath,
                fileName: fileName,
                frontendModifiedStartContent:
                  args.templateType === TemplateType.TemplatedControl ? `xmlns:controls="using:` : `x:Class="`,
                frontendModifiedEndContent: args.templateType === TemplateType.TemplatedControl ? `">` : `"`,
                backendModifiedStartContent: `namespace `,
                backendModifiedEndContent: `;`,
              });

              break;
            }

            case TemplateType.Styles:
            case TemplateType.ResourceDictionary: {
              break;
            }
          }
        });

        progress.report({
          message: `${type} created successfully 😎`,
          increment: 100,
        });
        resolve();
      });
    }
  );
}

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

async function changeNamespace(args: ChangeNamespaceType) {
  const slnDir = findSolutionFile(args.createPath, args.projectPath);
  if (!slnDir) {
    throw new Error("Solution not found.");
  }

  const startIndex = args.createPath.indexOf(slnDir) + slnDir.length;
  let namespace = args.createPath.substring(startIndex).replaceAll("\\", ".") + `.${args.fileName}`;

  const longNamespace = namespace.startsWith(".") ? namespace.substring(1) : namespace;
  const shortNamespace = longNamespace.substring(0, namespace.lastIndexOf(".") - 1);

  const frontendFilePath = path.join(args.createPath, `${args.fileName}.axaml`);
  const backendFilePath = path.join(args.createPath, `${args.fileName}.axaml.cs`);

  // Edit namespace in .axaml file
  await fs.readFile(frontendFilePath, "utf-8", async (readError, data) => {
    if (readError) {
      vscode.window.showErrorMessage(`Error reading file: ${readError.message}`);

      return;
    }

    const modifiedStartIndex =
      data.indexOf(args.frontendModifiedStartContent) + args.frontendModifiedStartContent.length;
    const modifiedEndIndex = data.indexOf(args.frontendModifiedEndContent, modifiedStartIndex);

    const modifiedData =
      data.substring(0, modifiedStartIndex) +
      (args.templateType === TemplateType.TemplatedControl ? shortNamespace : longNamespace) +
      data.substring(modifiedEndIndex);

    await fs.writeFile(frontendFilePath, modifiedData, (writeError) => {
      if (writeError) {
        vscode.window.showErrorMessage(`Error writing file: ${writeError.message}`);
        return;
      }
    });
  });

  // Edit namespace in .axaml.cs file
  await fs.readFile(backendFilePath, "utf-8", async (readError, data) => {
    if (readError) {
      vscode.window.showErrorMessage(`Error reading file: ${readError.message}`);
      return;
    }

    const modifiedStartIndex = data.indexOf(args.backendModifiedStartContent) + args.backendModifiedStartContent.length;
    const modifiedEndIndex = data.indexOf(args.backendModifiedEndContent, modifiedStartIndex);

    const modifiedData = data.substring(0, modifiedStartIndex) + shortNamespace + data.substring(modifiedEndIndex);

    await fs.writeFile(backendFilePath, modifiedData, (writeError) => {
      if (writeError) {
        vscode.window.showErrorMessage(`Error writing file: ${writeError.message}`);
        return;
      }
    });
  });
}

function findSolutionFile(startDir: string, rootDir: string) {
  let currentDir = startDir;

  if (fs.readdirSync(rootDir).some((file) => file.endsWith(".sln"))) {
    return rootDir; // Return the current directory if a .sln file is found.
  }

  //   while (currentDir !== path.parse(currentDir).root) {
  while (currentDir !== rootDir) {
    const solutionFile = path.join(currentDir, "*.sln"); // Use `.sln` to search.

    // Check if the .sln file exists in the current directory
    if (fs.readdirSync(currentDir).some((file) => file.endsWith(".sln"))) {
      return currentDir; // Return the current directory if a .sln file is found.
    }

    // Move to the parent directory
    currentDir = path.dirname(currentDir);
  }

  return null; // Return null if no .sln file is found
}
