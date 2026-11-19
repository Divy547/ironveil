import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { Node, Project, SyntaxKind } from 'ts-morph';
import { deriveResourceNames } from '../scaffolding/names.js';
import type { IronveilManifest } from '../manifest/index.js';
import type { FileSystem } from '../utils/filesystem.js';
import type { Finding } from './types.js';

const APP_MODULE_PATH = 'src/app.module.ts';

export interface ModuleFacts {
  /** Classes decorated with `@Module`. */
  readonly declared: readonly string[];
  /** Every identifier inside the `imports` array of an `@Module` in this file. */
  readonly imported: readonly string[];
}

/**
 * Reads what a file says about Nest modules. Only the `imports` array counts
 * as registration: a module listed in `providers` or `exports` is not loaded
 * by that mention. Wrappers such as `forwardRef(() => X)` and `X.forRoot()`
 * are covered because every identifier inside the array is collected.
 */
export function readModuleFacts(project: Project, fileName: string, source: string): ModuleFacts {
  const sourceFile = project.createSourceFile(fileName, source, { overwrite: true });
  const declared: string[] = [];
  const imported = new Set<string>();

  for (const declaration of sourceFile.getClasses()) {
    const decorator = declaration.getDecorator('Module');
    const name = declaration.getName();
    if (decorator === undefined || name === undefined) continue;

    declared.push(name);

    const options = decorator.getArguments()[0];
    if (options === undefined || !Node.isObjectLiteralExpression(options)) continue;

    const property = options.getProperty('imports');
    if (property === undefined || !Node.isPropertyAssignment(property)) continue;

    const value = property.getInitializer();
    if (value === undefined) continue;

    if (Node.isIdentifier(value)) imported.add(value.getText());
    for (const identifier of value.getDescendantsOfKind(SyntaxKind.Identifier)) {
      imported.add(identifier.getText());
    }
  }

  return { declared, imported: [...imported] };
}

export interface ModuleCheckInput {
  readonly root: string;
  readonly manifest: IronveilManifest;
  readonly fs: FileSystem;
}

export async function checkModules({ root, manifest, fs }: ModuleCheckInput): Promise<Finding[]> {
  const findings: Finding[] = [];

  if (!(await fs.exists(path.join(root, APP_MODULE_PATH)))) {
    findings.push({
      check: 'modules',
      severity: 'error',
      message: `${APP_MODULE_PATH} is missing, so there is no root module for Nest to start.`,
      fix: 'Restore it from version control.',
    });
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const moduleFiles = await listModuleFiles(root);
  const facts = new Map<string, ModuleFacts>();

  for (const file of moduleFiles) {
    facts.set(file, readModuleFacts(project, file, await fs.readFile(path.join(root, file))));
  }

  for (const [file, { declared }] of facts) {
    if (file === APP_MODULE_PATH) continue;

    for (const name of declared) {
      const registered = [...facts].some(
        ([other, { imported }]) => other !== file && imported.includes(name),
      );

      if (!registered) {
        findings.push({
          check: 'modules',
          severity: 'warning',
          message: `${name} (${file}) is not imported by any module, so Nest never loads it.`,
          fix: `Add ${name} to the imports of AppModule in ${APP_MODULE_PATH}.`,
        });
      }
    }
  }

  for (const resource of Object.keys(manifest.resources ?? {})) {
    const modulePath = resourceModulePath(resource);

    if (modulePath !== undefined && !moduleFiles.includes(modulePath)) {
      findings.push({
        check: 'modules',
        severity: 'warning',
        message: `Resource "${resource}" is recorded in ironveil.json, but ${modulePath} does not exist.`,
        fix: `Restore the folder, or remove "${resource}" from "resources" in ironveil.json.`,
      });
    }
  }

  return findings;
}

function resourceModulePath(resource: string): string | undefined {
  try {
    const { pluralKebab } = deriveResourceNames(resource);

    return `src/modules/${pluralKebab}/${pluralKebab}.module.ts`;
  } catch {
    // A hand-edited name `generate` would reject: nothing to compare it with.
    return undefined;
  }
}

async function listModuleFiles(root: string): Promise<string[]> {
  let entries: string[];

  try {
    entries = await readdir(path.join(root, 'src'), { recursive: true });
  } catch {
    return [];
  }

  return entries
    .map((entry) => `src/${entry.split(path.sep).join('/')}`)
    .filter((entry) => entry.endsWith('.module.ts'))
    .sort();
}
