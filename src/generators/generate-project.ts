import path from 'node:path';
import type { ForgeKitConfig } from '../config/index.js';
import {
  createGenerationContext,
} from './core/generation-context.js';
import {
  createGenerationPlan,
} from './core/generation-plan.js';
import {
  createGenerationOrchestrator,
} from './core/generation-orchestrator.js';
import {
  createGenerators,
} from './core/generator-registry.js';
import type { Generator } from './core/generator.js';
import {
  createTemplateLoader,
} from '../rendering/template-loader.js';
import {
  createTemplateRenderer,
} from '../rendering/template-renderer.js';
import {
  getTemplatesDirectory,
} from '../rendering/template-path.js';
import {
  createFileSystem,
  type FileSystem,
} from '../utils/filesystem.js';
import type { PackageJson } from '../utils/package-manifest.js';
import { createPackageValidator } from '../validation/index.js';
import { GenerationError } from './core/generation-error.js';

export interface GenerateProjectOptions {
  readonly dryRun?: boolean;
}

export interface GenerationResult {
  readonly projectName: string;
  readonly destination: string;
  readonly config: ForgeKitConfig;
  readonly generators: readonly string[];
  readonly files: readonly string[];
}

function createTrackingFileSystem(
  innerFs: FileSystem,
  basePath: string,
  trackedFiles: Set<string>,
): FileSystem {
  return {
    ensureDirectory: (dir) => innerFs.ensureDirectory(dir),
    readFile: (file) => innerFs.readFile(file),
    exists: (file) => innerFs.exists(file),
    remove: (target) => innerFs.remove(target),
    move: (src, dest) => innerFs.move(src, dest),
    async writeFile(filePath: string, content: string): Promise<void> {
      const relativePath = path
        .relative(basePath, filePath)
        .split(path.sep)
        .join('/');
      trackedFiles.add(relativePath);
      return innerFs.writeFile(filePath, content);
    },
  };
}

export async function generateProject(
  config: ForgeKitConfig,
  cwd: string = process.cwd(),
  generators: readonly Generator[] = createGenerators(),
  options: GenerateProjectOptions = {},
): Promise<GenerationResult> {
  const destination = path.resolve(
    cwd,
    config.projectName,
  );

  const fs = createFileSystem();

  if (await fs.exists(destination)) {
    throw new GenerationError(
      `Destination already exists: ${destination}`,
      {
        projectName: config.projectName,
        destination,
      },
    );
  }

  const stagingId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const stagingDestination = path.join(
    path.dirname(destination),
    `.${config.projectName}-staging-${stagingId}`,
  );

  await fs.ensureDirectory(stagingDestination);

  const trackedFiles = new Set<string>();
  const trackingFs = createTrackingFileSystem(
    fs,
    stagingDestination,
    trackedFiles,
  );

  const loader = createTemplateLoader(
    getTemplatesDirectory(),
    trackingFs,
  );

  const renderer = createTemplateRenderer();

  const context = createGenerationContext(
    config,
    stagingDestination,
    trackingFs,
    loader,
    renderer,
  );

  const plan = createGenerationPlan(config, generators);

  const orchestrator =
    createGenerationOrchestrator();

  try {
    await orchestrator.generate(
      plan,
      context,
    );

    // Read and parse package.json from staging directory
    const packageJsonPath = path.join(stagingDestination, 'package.json');
    let packageJsonContent: string;
    try {
      packageJsonContent = await trackingFs.readFile(packageJsonPath);
    } catch (readError) {
      throw new GenerationError(
        `Failed to read package.json from staging directory: ${readError instanceof Error ? readError.message : String(readError)}`,
        {
          projectName: config.projectName,
          generatorName: 'package-validator',
          destination: stagingDestination,
          cause: readError,
        },
      );
    }

    let parsedManifest: PackageJson;
    try {
      parsedManifest = JSON.parse(packageJsonContent) as PackageJson;
    } catch (parseError) {
      throw new GenerationError(
        `Failed to parse package.json from staging directory: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        {
          projectName: config.projectName,
          generatorName: 'package-validator',
          destination: stagingDestination,
          cause: parseError,
        },
      );
    }

    const validator = createPackageValidator();
    validator.validateOrThrow(parsedManifest, config, stagingDestination);

    const result: GenerationResult = {
      projectName: config.projectName,
      destination,
      config,
      generators: plan.generators.map((g) => g.name),
      files: Array.from(trackedFiles).sort(),
    };

    if (options.dryRun) {
      await fs.remove(stagingDestination);
      return result;
    }

    await fs.move(
      stagingDestination,
      destination,
    );

    return result;
  } catch (error) {
    try {
      await fs.remove(stagingDestination);
    } catch (cleanupError) {
      console.error(
        `Warning: Failed to clean up staging directory at ${stagingDestination}`,
        cleanupError,
      );
    }

    throw error;
  }
}