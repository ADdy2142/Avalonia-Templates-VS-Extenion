import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as path from "path";
import * as fs from "fs";
import { TemplateType } from "./types/template-type";
import { CreateTemplateType } from "./types/create-template-type";
import { ChangeNamespaceType } from "./types/change-namespace-type";
import { ChangeFileContentType } from "./types/change-file-content-type";

export function activate(context: vscode.ExtensionContext) {
  // Command for creating Avalonia Window
  const windowDisposable = vscode.commands.registerCommand("avalonia-templates.createWindow", (args: any) => {
    createTemplate({
      templateType: TemplateType.Window,
      fsPath: args?.fsPath,
    });
  });

  // Command for creating Avalonia UserControl
  const userControlDisposable = vscode.commands.registerCommand("avalonia-templates.createUserControl", (args: any) => {
    createTemplate({
      templateType: TemplateType.UserControl,
      fsPath: args?.fsPath,
    });
  });

  // Command for creating Avalonia TemplatedControl
  const templatedControlDisposable = vscode.commands.registerCommand(
    "avalonia-templates.createTemplatedControl",
    (args: any) => {
      createTemplate({
        templateType: TemplateType.TemplatedControl,
        fsPath: args?.fsPath,
      });
    }
  );

  // Command for creating Avalonia Styles
  const stylesDisposable = vscode.commands.registerCommand("avalonia-templates.createStyles", (args: any) => {
    createTemplate({
      templateType: TemplateType.Styles,
      fsPath: args?.fsPath,
    });
  });

  // Command for creating Avalonia ResourceDictionary
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

async function createTemplate(args: CreateTemplateType) {
  // Finding type of file
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

  // Get file name from user
  const fileName = await vscode.window.showInputBox({
    placeHolder: `Choose a name for ${type}`,
  });

  // File name must have value
  if (!fileName) {
    vscode.window.showErrorMessage("Please choose a name 🫠");
    return;
  }

  // Finding root of workspace
  const projectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "";
  // Finding the folder on which the right-click event occurred. If null choose project path
  let createPath = (args.fsPath as string) ?? projectPath;

  // Make sure path has value
  if (!createPath) {
    vscode.window.showErrorMessage("Can't create template 🥲");
    return;
  }

  // dotnet command for creating avalonia template
  const command = `dotnet new avalonia.${
    type.toLowerCase() === "ResourceDictionary".toLowerCase() ? "resource" : type.toLowerCase()
  } --name ${fileName}`;

  // Show progress bar until job done
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Avalonia UI Templates",
    },
    (progress) => {
      return new Promise<void>((resolve) => {
        // Execute dotnet command
        childProcess.exec(command, { cwd: createPath }, async (error) => {
          // Make sure execution has no error
          if (error) {
            vscode.window.showErrorMessage(`Error creating file: ${error.message}`);
            return;
          }

          // Change namespace of file
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
              await openTextDocument(path.join(createPath, `${fileName}.axaml`));
              break;
            }
          }

          // Job done successfully
          progress.report({
            increment: 100,
          });

          // Close progress
          resolve();
        });
      });
    }
  );
}

// Change namespace of file
function changeNamespace(args: ChangeNamespaceType) {
  // Find the directory that has the .sln file
  const slnDir = findSolutionFile(args.createPath, args.projectPath);

  // If .sln not found throw an error
  if (!slnDir) {
    throw new Error("Solution not found.");
  }

  // Finding namespace
  const startIndex = args.createPath.indexOf(slnDir) + slnDir.length;
  let namespace = args.createPath.substring(startIndex).replaceAll("\\", ".") + `.${args.fileName}`;
  namespace = namespace.startsWith(".") ? namespace.substring(1) : namespace;

  // If namespace is null or equals to filename then put solution name in namespace
  if (!namespace || namespace.toLowerCase() === args.fileName.toLowerCase()) {
    namespace = slnDir.substring(slnDir.lastIndexOf("\\") + 1) + `.${args.fileName}`;
  }

  // Namespace without .axaml file name.
  // Example: We have MainWindow.axaml and MainWindow.axaml.cs
  // The namespace for the first file must end with MainWindow
  // But the namespace for the second file should not end with MainWindow
  const shortNamespace = namespace.substring(0, namespace.lastIndexOf(".") - 1);

  // Finding .axaml and .axaml.cs file path
  const frontendFilePath = path.join(args.createPath, `${args.fileName}.axaml`);
  const backendFilePath = path.join(args.createPath, `${args.fileName}.axaml.cs`);

  // Edit namespace in .axaml file
  changeFileContent({
    filePath: frontendFilePath,
    startContent: args.frontendModifiedStartContent,
    endContent: args.frontendModifiedEndContent,
    templateType: args.templateType,
    namespace: namespace,
    shortNamespace: shortNamespace,
    openFile: true,
    isBackendFile: false,
  });

  // Edit namespace in .axaml.cs file
  changeFileContent({
    filePath: backendFilePath,
    startContent: args.backendModifiedStartContent,
    endContent: args.backendModifiedEndContent,
    templateType: args.templateType,
    namespace: namespace,
    shortNamespace: shortNamespace,
    openFile: false,
    isBackendFile: true,
  });
}

// Finding a directory that contains .sln file
// Return directory if exist otherwise return null
function findSolutionFile(startDir: string, rootDir: string) {
  let currentDir = startDir;

  if (fs.readdirSync(rootDir).some((file) => file.endsWith(".sln"))) {
    return rootDir; // Return the current directory if a .sln file is found.
  }

  //   while (currentDir !== path.parse(currentDir).root) {
  while (currentDir !== rootDir) {
    // Check if the .sln file exists in the current directory
    if (fs.readdirSync(currentDir).some((file) => file.endsWith(".sln"))) {
      return currentDir; // Return the current directory if a .sln file is found.
    }

    // Move to the parent directory
    currentDir = path.dirname(currentDir);
  }

  return null; // Return null if no .sln file is found
}

// Open .axaml file after creation
async function openTextDocument(filePath: string) {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document);
}

// Change the namespace of files .axaml and .axaml.cs
function changeFileContent(args: ChangeFileContentType) {
  // Read file content
  fs.readFile(args.filePath, "utf-8", (readError, data) => {
    // If error, show to user
    if (readError) {
      vscode.window.showErrorMessage(`Error reading file: ${readError.message}`);
      return;
    }

    // Find current namespace in file
    const modifiedStartIndex = data.indexOf(args.startContent) + args.startContent.length;
    const modifiedEndIndex = data.indexOf(args.endContent, modifiedStartIndex);

    // Add new namespace in file
    const modifiedData =
      data.substring(0, modifiedStartIndex) +
      (args.isBackendFile || args.templateType === TemplateType.TemplatedControl
        ? args.shortNamespace
        : args.namespace) +
      data.substring(modifiedEndIndex);

    // Write new content to file
    fs.writeFile(args.filePath, modifiedData, async (writeError) => {
      // If error, show to user
      if (writeError) {
        vscode.window.showErrorMessage(`Error writing file: ${writeError.message}`);
        return;
      }

      // If file ext is .axaml, Open it
      if (args.openFile) {
        await openTextDocument(args.filePath);
      }
    });
  });
}
