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
  let alsoCreateViewModel = false;
  switch (args.templateType) {
    case TemplateType.Window: {
      type = "Window";
      alsoCreateViewModel = await showInfoMessageForCreatingViewModel(type);
      break;
    }

    case TemplateType.UserControl: {
      type = "UserControl";
      alsoCreateViewModel = await showInfoMessageForCreatingViewModel(type);
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
    placeHolder: `Choose a name for your ${type}`,
  });

  // Make sure file name has value
  if (!fileName) {
    vscode.window.showErrorMessage("File name is not valid. Please try again with a valid name.");
    return;
  }

  // Finding root of workspace
  const projectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "";
  // Finding the folder on which the right-click event occurred. If null choose project path
  const createPath = (args.fsPath as string) ?? projectPath;

  // Make sure path has value
  if (!createPath) {
    vscode.window.showErrorMessage("Unable to find a suitable location to create the file. Please try again.");
    return;
  }

  // dotnet command for creating avalonia template
  let command = `dotnet new avalonia.${
    type.toLowerCase() === "ResourceDictionary".toLowerCase() ? "resource" : type.toLowerCase()
  } -n ${fileName}`;

  // Show progress bar until job done
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Avalonia UI Templates",
    },
    async (progress) => {
      try {
        // Change progress bar message
        progress.report({ message: "Creating template..." });
        // Execute dotnet command
        childProcess.execSync(command, { cwd: createPath });

        // Change namespace of file(s)
        switch (args.templateType) {
          case TemplateType.Window:
          case TemplateType.UserControl:
          case TemplateType.TemplatedControl: {
            await changeNamespaces({
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

        // Check if user wants to create view model also
        if (alsoCreateViewModel) {
          await createViewModel(createPath, fileName, projectPath, args.templateType);
        }

        // Change progress
        progress.report({ increment: 100, message: "Template created successfully!" });
      } catch (error) {
        // Change progress
        progress.report({
          message: "An error occurred while trying to create your files",
          increment: 100,
        });
      }
    }
  );
}

// Change namespace of file
async function changeNamespaces(args: ChangeNamespaceType) {
  // Find namespace of file
  const namespaces = findNameSpaces(args.createPath, args.projectPath, args.fileName);

  // Finding .axaml and .axaml.cs file path
  const frontendFilePath = path.join(args.createPath, `${args.fileName}.axaml`);
  const backendFilePath = path.join(args.createPath, `${args.fileName}.axaml.cs`);

  // Edit namespace in .axaml file
  await changeFileContent({
    filePath: frontendFilePath,
    startContent: args.frontendModifiedStartContent,
    endContent: args.frontendModifiedEndContent,
    templateType: args.templateType,
    xamlNameSpace: namespaces.xamlNameSpace,
    csharpNameSpace: namespaces.csharpNameSpace,
    openFile: true,
    isCSharpFile: false,
  });

  // Edit namespace in .axaml.cs file
  await changeFileContent({
    filePath: backendFilePath,
    startContent: args.backendModifiedStartContent,
    endContent: args.backendModifiedEndContent,
    templateType: args.templateType,
    xamlNameSpace: namespaces.xamlNameSpace,
    csharpNameSpace: namespaces.csharpNameSpace,
    openFile: false,
    isCSharpFile: true,
  });
}

function findNameSpaces(createPath: string, projectPath: string, fileName: string) {
  // Find the directory that has the .sln file
  const directory = findDirectory(createPath, projectPath, ".sln") ?? findDirectory(createPath, projectPath, ".csproj");
  // If .sln or .csproj not found throw an error
  if (!directory) {
    throw new Error("Solution not found.");
  }

  // Indicates if solution file is found
  let isSolutionDirectory = fs.readdirSync(directory).some((file) => file.endsWith(".sln"));
  let csProjectFileName = "";
  if (!isSolutionDirectory) {
    // Find .csproj file name
    const csprojFile = fs.readdirSync(directory).find((file) => file.endsWith(".csproj"));
    // If .csproj file not found throw an error
    if (!csprojFile) {
      throw new Error("CSharp project file not found.");
    }

    csProjectFileName = csprojFile.replace(".csproj", "");
  }

  // Finding namespace
  const startIndex = createPath.indexOf(directory) + directory.length;
  let namespace = createPath.substring(startIndex).replaceAll("\\", ".") + `.${fileName}`;
  namespace = namespace.startsWith(".") ? namespace.substring(1) : namespace;
  if (!isSolutionDirectory) {
    namespace = `${csProjectFileName}.${namespace}`;
  }

  // If namespace is null or equals to filename then put solution name in namespace
  if (!namespace || namespace.toLowerCase() === fileName.toLowerCase()) {
    namespace = directory.substring(directory.lastIndexOf("\\") + 1) + `.${fileName}`;
  }

  if (!namespace) {
    throw new Error("Namespace not found.");
  }

  const result = {
    // Find namespace
    xamlNameSpace: namespace,
    // Namespace without .axaml file name.
    // Example: We have MainWindow.axaml and MainWindow.axaml.cs
    // The namespace for the first file must end with MainWindow
    // But the namespace for the second file should not end with MainWindow
    csharpNameSpace: namespace.includes(".") ? namespace.substring(0, namespace.lastIndexOf(".")) : namespace,
  };

  return result;
}

// Finding a directory that contains .sln file
// Return directory if exist otherwise return null
function findDirectory(startDir: string, rootDir: string, fileType: string) {
  let currentDir = startDir;

  if (fs.readdirSync(rootDir).some((file) => file.endsWith(fileType))) {
    return rootDir; // Return the current directory if a .sln file is found.
  }

  //   while (currentDir !== path.parse(currentDir).root) {
  while (currentDir !== rootDir) {
    // Check if the .sln file exists in the current directory
    if (fs.readdirSync(currentDir).some((file) => file.endsWith(fileType))) {
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
async function changeFileContent(args: ChangeFileContentType) {
  // Read file content
  const fileContent = fs.readFileSync(args.filePath, { encoding: "utf-8" });
  // Find current namespace in file
  const modifiedStartIndex = fileContent.indexOf(args.startContent) + args.startContent.length;
  const modifiedEndIndex = fileContent.indexOf(args.endContent, modifiedStartIndex);

  // Add new namespace in file
  const modifiedData =
    fileContent.substring(0, modifiedStartIndex) +
    (args.isCSharpFile || args.templateType === TemplateType.TemplatedControl
      ? args.csharpNameSpace
      : args.xamlNameSpace) +
    fileContent.substring(modifiedEndIndex);

  // Write new content to file
  fs.writeFileSync(args.filePath, modifiedData);
  // Open file
  if (args.openFile) {
    await openTextDocument(args.filePath);
  }
}

async function showInfoMessageForCreatingViewModel(templateType: string | undefined) {
  if (!templateType) {
    return false;
  }

  const userOption = await vscode.window.showInformationMessage(
    `Would you like to create a ViewModel for your ${templateType} as well?`,
    "Yes",
    "No"
  );

  return userOption === "Yes";
}

async function createViewModel(viewPath: string, viewName: string, projectPath: string, templateType: TemplateType) {
  let directory = viewPath;

  // If the view (Window or UserControl) is located in the \\Views\\ path,
  // the extension automatically creates the ViewModel in the \\ViewModels\\ path, following the MVVM pattern.
  if (directory.toLowerCase().includes("\\views")) {
    const index = directory.toLowerCase().indexOf("\\views");
    directory = directory.substring(0, index);
    directory += "\\ViewModels";

    // Make sure ViewModels directory is exists
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory);
    }
  }

  const fileName = viewName.toLowerCase().endsWith("view") ? viewName + "Model" : viewName + "ViewModel";

  const command = `dotnet new class -n ${fileName}`;
  childProcess.execSync(command, { cwd: directory });

  const namespaces = findNameSpaces(directory, projectPath, fileName);
  const filePath = path.join(directory, `${fileName}.cs`);
  await changeFileContent({
    filePath: filePath,
    isCSharpFile: true,
    startContent: "namespace ",
    endContent: ";",
    xamlNameSpace: namespaces.xamlNameSpace,
    csharpNameSpace: namespaces.csharpNameSpace,
    openFile: false,
    templateType: templateType,
  });

  // Check if ViewModelBase file is exists
  const viewModelBasePath = path.join(directory, "ViewModelBase.cs");
  if (!fs.existsSync(viewModelBasePath)) {
    return;
  }

  // ViewModel inherits from ViewModelBase
  inheritFromViewModelBase(filePath, fileName);
}

function inheritFromViewModelBase(viewModelFilePath: string, viewModelFileName: string) {
  // Read file content
  const fileContent = fs.readFileSync(viewModelFilePath, { encoding: "utf-8" });
  // Find start index of changes
  const startIndex = fileContent.indexOf(` class ${viewModelFileName}`);
  // Find end index of changes
  const endIndex = fileContent.indexOf("{", startIndex);
  // Modify file content
  const modifiedData =
    fileContent.substring(0, startIndex) +
    ` class ${viewModelFileName} : ViewModelBase\r\n` +
    fileContent.substring(endIndex);

  // Write new content to file
  fs.writeFileSync(viewModelFilePath, modifiedData);
}
