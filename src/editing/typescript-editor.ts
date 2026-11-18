import {
  IndentationText,
  NewLineKind,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
  type ArrayLiteralExpression,
  type ClassDeclaration,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';
import { EditError } from './edit-error.js';

/**
 * Code-editing layer for existing TypeScript files, built on ts-morph.
 *
 * Every function takes the file's text and returns the edited text. Nothing
 * touches the disk, so callers can diff the result for `--dry-run` or write it
 * out themselves. Every edit is idempotent: applying it to its own output
 * returns the same text. Anything the edit does not touch (comments, blank
 * lines, formatting) is left exactly as it was.
 */

export const MODULE_PROPERTIES = [
  'imports',
  'providers',
  'controllers',
  'exports',
] as const;

export type ModuleProperty = (typeof MODULE_PROPERTIES)[number];

export interface ImportSpec {
  readonly moduleSpecifier: string;
  readonly namedImports: readonly string[];
}

export interface ModuleTarget {
  /** Which `@Module` class to edit. Required when a file declares several. */
  readonly targetClass?: string;
}

export interface ModuleImportSpec extends ModuleTarget {
  readonly moduleName: string;
  readonly importPath: string;
}

export interface ProviderSpec extends ModuleTarget {
  readonly className: string;
  readonly importPath: string;
}

export interface RegisterInModuleSpec extends ModuleTarget {
  readonly property: ModuleProperty;
  readonly name: string;
  readonly importPath: string;
}

export function addImportDeclaration(source: string, spec: ImportSpec): string {
  return edit(source, (sourceFile) => {
    ensureNamedImports(sourceFile, spec);
  });
}

/** Registers `moduleName` in the `imports` array of an `@Module` class. */
export function addModuleImport(
  source: string,
  spec: ModuleImportSpec,
): string {
  return registerInModule(source, {
    property: 'imports',
    name: spec.moduleName,
    importPath: spec.importPath,
    targetClass: spec.targetClass,
  });
}

/** Registers `className` in the `providers` array of an `@Module` class. */
export function addProvider(source: string, spec: ProviderSpec): string {
  return registerInModule(source, {
    property: 'providers',
    name: spec.className,
    importPath: spec.importPath,
    targetClass: spec.targetClass,
  });
}

/**
 * Imports `name` from `importPath` and adds it to one of the arrays of the
 * `@Module` decorator (`imports`, `providers`, `controllers`, `exports`),
 * creating the array when it is missing.
 */
export function registerInModule(
  source: string,
  spec: RegisterInModuleSpec,
): string {
  if (!MODULE_PROPERTIES.includes(spec.property)) {
    throw new EditError(
      `Cannot register in "${String(spec.property)}": expected one of ${MODULE_PROPERTIES.join(', ')}.`,
    );
  }

  return edit(source, (sourceFile) => {
    const moduleClass = findModuleClass(sourceFile, spec.targetClass);

    ensureNamedImports(sourceFile, {
      moduleSpecifier: spec.importPath,
      namedImports: [spec.name],
    });

    const array = getOrCreateModuleArray(moduleClass, spec.property);
    const alreadyRegistered = array
      .getElements()
      .some((element) => element.getText().trim() === spec.name);

    if (!alreadyRegistered) {
      appendElement(sourceFile, array, spec.name);
    }
  });
}

/**
 * Appends `name` to the array, keeping the array's own style: one element per
 * line stays one element per line, and a trailing comma stays a trailing comma.
 */
function appendElement(
  sourceFile: SourceFile,
  array: ArrayLiteralExpression,
  name: string,
): void {
  const multiline = spansLines(array);
  const trailingComma = hasTrailingComma(array);

  const added = array.addElement(name, { useNewLines: multiline });

  if (multiline && trailingComma) {
    sourceFile.insertText(added.getEnd(), ',');
  }
}

function hasTrailingComma(array: ArrayLiteralExpression): boolean {
  const body = array.getText().slice(1, -1).trimEnd();

  return body.endsWith(',');
}

function edit(source: string, apply: (sourceFile: SourceFile) => void): string {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    manipulationSettings: {
      quoteKind: detectQuoteKind(source),
      indentationText: detectIndentation(source),
      newLineKind: source.includes('\r\n')
        ? NewLineKind.CarriageReturnLineFeed
        : NewLineKind.LineFeed,
    },
  });
  const sourceFile = project.createSourceFile('edit-target.ts', source);

  const syntaxErrors = project
    .getProgram()
    .getSyntacticDiagnostics(sourceFile);

  if (syntaxErrors.length > 0) {
    const first = syntaxErrors[0]!;
    const message = first.getMessageText();
    const text = typeof message === 'string' ? message : message.getMessageText();
    throw new EditError(
      `Cannot edit a file with syntax errors (line ${first.getLineNumber() ?? '?'}: ${text}).`,
    );
  }

  apply(sourceFile);

  return sourceFile.getFullText();
}

function detectQuoteKind(source: string): QuoteKind {
  const match = /(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])/.exec(source);

  return match?.[1] === '"' ? QuoteKind.Double : QuoteKind.Single;
}

function detectIndentation(source: string): IndentationText {
  const match = /^([ \t]+)\S/m.exec(source);
  const indent = match?.[1] ?? '  ';

  if (indent.startsWith('\t')) return IndentationText.Tab;
  if (indent.length >= 4 && indent.length % 4 === 0) {
    return IndentationText.FourSpaces;
  }

  return IndentationText.TwoSpaces;
}

function ensureNamedImports(sourceFile: SourceFile, spec: ImportSpec): void {
  if (spec.namedImports.length === 0) {
    throw new EditError(
      `Cannot add an import from "${spec.moduleSpecifier}" without any names.`,
    );
  }

  const missing: string[] = [];

  for (const name of new Set(spec.namedImports)) {
    const existing = findImportedName(sourceFile, name);

    if (existing === undefined) {
      missing.push(name);
      continue;
    }

    if (existing !== spec.moduleSpecifier) {
      throw new EditError(
        `"${name}" is already imported from "${existing}", so it cannot also be imported from "${spec.moduleSpecifier}".`,
      );
    }
  }

  if (missing.length === 0) {
    return;
  }

  const sameModule = sourceFile
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === spec.moduleSpecifier &&
        !declaration.isTypeOnly() &&
        declaration.getNamespaceImport() === undefined,
    );

  if (sameModule !== undefined) {
    sameModule.addNamedImports(missing);
    return;
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier: spec.moduleSpecifier,
    namedImports: missing,
  });
}

/** The module specifier `name` is bound from, or `undefined` if it is not. */
function findImportedName(
  sourceFile: SourceFile,
  name: string,
): string | undefined {
  for (const declaration of sourceFile.getImportDeclarations()) {
    const bindings = [
      declaration.getDefaultImport()?.getText(),
      declaration.getNamespaceImport()?.getText(),
      ...declaration
        .getNamedImports()
        .map((named) => named.getAliasNode()?.getText() ?? named.getName()),
    ];

    if (bindings.includes(name)) {
      return declaration.getModuleSpecifierValue();
    }
  }

  return undefined;
}

function findModuleClass(
  sourceFile: SourceFile,
  targetClass: string | undefined,
): ClassDeclaration {
  const moduleClasses = sourceFile
    .getClasses()
    .filter((declaration) => declaration.getDecorator('Module') !== undefined);

  if (targetClass !== undefined) {
    const target = moduleClasses.find(
      (declaration) => declaration.getName() === targetClass,
    );

    if (target === undefined) {
      throw new EditError(
        `No @Module class named "${targetClass}" found in this file.`,
      );
    }

    return target;
  }

  if (moduleClasses.length === 0) {
    throw new EditError('No class with an @Module decorator found in this file.');
  }

  if (moduleClasses.length > 1) {
    const names = moduleClasses.map((declaration) => declaration.getName());
    throw new EditError(
      `This file has several @Module classes (${names.join(', ')}); say which one to edit.`,
    );
  }

  return moduleClasses[0]!;
}

function getOrCreateModuleArray(
  moduleClass: ClassDeclaration,
  property: ModuleProperty,
): ArrayLiteralExpression {
  const decorator = moduleClass.getDecoratorOrThrow('Module');
  const [argument] = decorator.getArguments();

  if (argument === undefined) {
    decorator.addArgument('{}');
  }

  const options = decorator.getArguments()[0];

  if (options === undefined || !Node.isObjectLiteralExpression(options)) {
    throw new EditError(
      `The @Module decorator on ${moduleClass.getName() ?? 'this class'} does not take an object literal, so it cannot be edited.`,
    );
  }

  return getOrCreateArrayProperty(options, property);
}

function getOrCreateArrayProperty(
  options: ObjectLiteralExpression,
  property: ModuleProperty,
): ArrayLiteralExpression {
  const existing = options.getProperty(property);

  if (existing === undefined) {
    const created = options.addPropertyAssignment({
      name: property,
      initializer: '[]',
    });

    return created.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  }

  if (Node.isPropertyAssignment(existing)) {
    const initializer = existing.getInitializer();

    if (initializer !== undefined && Node.isArrayLiteralExpression(initializer)) {
      return initializer;
    }
  }

  throw new EditError(
    `"${property}" in the @Module decorator is not an array literal, so it cannot be edited automatically.`,
  );
}

function spansLines(array: ArrayLiteralExpression): boolean {
  return array.getElements().length === 0 || array.getText().includes('\n');
}
