import path from 'node:path';
import type { IronveilConfig } from '../config/index.js';
import { addModuleImport, registerInModule } from '../editing/index.js';
import { manifestToConfig, readManifest } from '../manifest/index.js';
import { createChangeSet, type ChangeSet } from '../safety/index.js';
import {
  buildControllerSpec,
  buildEmptyModule,
  buildGuard,
  buildGuardSpec,
  buildPlainController,
  buildPlainService,
  buildServiceSpec,
} from './component/builders.js';
import type { FieldSpec } from './fields.js';
import { GenerateError } from './generate-error.js';
import { deriveResourceNames, type ResourceNames } from './names.js';
import { buildDtoClass } from './resource/dto.js';

export const COMPONENT_KINDS = [
  'module',
  'controller',
  'service',
  'guard',
  'dto',
] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

const APP_MODULE_PATH = 'src/app.module.ts';

export interface PlanComponentOptions {
  /** The Ironveil project root (the folder that holds `ironveil.json`). */
  readonly root: string;
  readonly kind: ComponentKind;
  /** The name as typed: `billing`, `api-key`, `BlogPost`. Used as is, never pluralised. */
  readonly name: string;
  /** Put the file in this existing feature module instead of the default place. */
  readonly module?: string;
  /** Properties of a DTO. Only valid for `dto`. */
  readonly fields?: readonly FieldSpec[];
}

export interface ComponentPlan {
  /** Everything to write. Nothing is on disk until it is applied. */
  readonly changeSet: ChangeSet;
  readonly config: IronveilConfig;
  readonly kind: ComponentKind;
  readonly names: ResourceNames;
}

interface PlannedFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Plans `ironveil generate module|controller|service|guard|dto <name>`.
 *
 * Where things go:
 * - `module`: `src/modules/<name>/<name>.module.ts`, imported by `AppModule`.
 * - `controller`, `service`: `src/modules/<feature>/`, registered in that
 *   feature's module. `<feature>` is `--module`, or the name itself, in which
 *   case the module is created when it is missing.
 * - `guard`, `dto`: `src/common/guards` / `src/common/dto`, or
 *   `src/modules/<module>/guards` / `dto` with `--module`. Nothing is
 *   registered: a guard is applied with `@UseGuards()`, a DTO is imported.
 *
 * Like `planResource` it reads the project but writes nothing, never
 * overwrites a file that differs from what it would generate, and plans no
 * changes when everything is already there.
 */
export async function planComponent(
  options: PlanComponentOptions,
): Promise<ComponentPlan> {
  const { kind } = options;
  const names = deriveResourceNames(options.name, kind);
  const fields = options.fields ?? [];

  if (kind === 'module' && options.module !== undefined) {
    throw new GenerateError(
      'A module has no parent module, so --module does not apply to "generate module".',
    );
  }
  if (kind !== 'dto' && fields.length > 0) {
    throw new GenerateError(
      `--fields only applies to "generate dto"; a ${kind} has no properties.`,
    );
  }

  const root = path.resolve(options.root);
  const config = manifestToConfig(await readManifest(root));
  const changeSet = createChangeSet(root);

  const feature =
    options.module === undefined
      ? names.kebab
      : deriveResourceNames(options.module, 'module').kebab;
  const featureDirectory = `src/modules/${feature}`;
  const modulePath = `${featureDirectory}/${feature}.module.ts`;
  const moduleExists = (await changeSet.read(modulePath)) !== null;

  if (options.module !== undefined && kind !== 'module' && !moduleExists) {
    throw new GenerateError(
      `Cannot generate ${kind} "${names.input}": module "${feature}" was not found (expected ${modulePath}). ` +
        `Run "ironveil generate module ${feature}" first.`,
    );
  }

  const files = filesFor(kind, names, config, fields, {
    featureDirectory,
    inFeature: options.module !== undefined,
  });

  const conflicts: string[] = [];
  const missing: PlannedFile[] = [];
  for (const planned of files) {
    const existing = await changeSet.read(planned.path);
    if (existing === null) {
      missing.push(planned);
    } else if (existing !== planned.content) {
      conflicts.push(planned.path);
    }
  }

  if (conflicts.length > 0) {
    throw new GenerateError(
      [
        `Cannot generate ${kind} "${names.input}": these files already exist and differ from what would be generated.`,
        'Ironveil never overwrites your code.',
        ...conflicts.map((conflict) => `  ${conflict}`),
        '',
        'Move or delete them first, or pick another name.',
      ].join('\n'),
    );
  }

  for (const planned of missing) {
    await changeSet.write(planned.path, planned.content);
  }

  if (kind === 'module') {
    await registerInAppModule(changeSet, names);
  } else if (kind === 'controller' || kind === 'service') {
    if (!moduleExists) {
      // The feature has no module yet: create it, then wire it into the app.
      const feature = deriveResourceNames(names.kebab, 'module');
      await changeSet.write(modulePath, buildEmptyModule(feature));
      await registerInAppModule(changeSet, feature);
    }

    const className = `${names.pascal}${kind === 'controller' ? 'Controller' : 'Service'}`;
    await changeSet.edit(modulePath, (text) =>
      registerInModule(text, {
        property: kind === 'controller' ? 'controllers' : 'providers',
        name: className,
        importPath: `./${names.kebab}.${kind}`,
      }),
    );
  }

  return { changeSet, config, kind, names };
}

function filesFor(
  kind: ComponentKind,
  names: ResourceNames,
  config: IronveilConfig,
  fields: readonly FieldSpec[],
  where: { featureDirectory: string; inFeature: boolean },
): PlannedFile[] {
  const { featureDirectory, inFeature } = where;
  const { kebab } = names;

  switch (kind) {
    case 'module':
      return [
        {
          path: `${featureDirectory}/${kebab}.module.ts`,
          content: buildEmptyModule(names),
        },
      ];
    case 'controller':
      return [
        {
          path: `${featureDirectory}/${kebab}.controller.ts`,
          content: buildPlainController(names, config),
        },
        ...(config.testing
          ? [
              {
                path: `${featureDirectory}/${kebab}.controller.spec.ts`,
                content: buildControllerSpec(names),
              },
            ]
          : []),
      ];
    case 'service':
      return [
        {
          path: `${featureDirectory}/${kebab}.service.ts`,
          content: buildPlainService(names),
        },
        ...(config.testing
          ? [
              {
                path: `${featureDirectory}/${kebab}.service.spec.ts`,
                content: buildServiceSpec(names),
              },
            ]
          : []),
      ];
    case 'guard': {
      const directory = inFeature
        ? `${featureDirectory}/guards`
        : 'src/common/guards';
      return [
        { path: `${directory}/${kebab}.guard.ts`, content: buildGuard(names) },
        ...(config.testing
          ? [
              {
                path: `${directory}/${kebab}.guard.spec.ts`,
                content: buildGuardSpec(names),
              },
            ]
          : []),
      ];
    }
    case 'dto': {
      const directory = inFeature ? `${featureDirectory}/dto` : 'src/common/dto';
      return [
        {
          path: `${directory}/${kebab}.dto.ts`,
          content: buildDtoClass(`${names.pascal}Dto`, fields, config.swagger),
        },
      ];
    }
  }
}

function registerInAppModule(
  changeSet: ChangeSet,
  names: ResourceNames,
): Promise<void> {
  return changeSet.edit(APP_MODULE_PATH, (text) =>
    addModuleImport(text, {
      moduleName: `${names.pascal}Module`,
      importPath: `./modules/${names.kebab}/${names.kebab}.module`,
    }),
  );
}
