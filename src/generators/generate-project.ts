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
} from '../utils/filesystem.js';
import { GenerationError } from './core/generation-error.js';

export async function generateProject(
  config: ForgeKitConfig,
  cwd: string = process.cwd(),
  generators: readonly Generator[] = createGenerators(),
): Promise<string> {
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

  const loader = createTemplateLoader(
    getTemplatesDirectory(),
    fs,
  );

  const renderer = createTemplateRenderer();

  const context = createGenerationContext(
    config,
    stagingDestination,
    fs,
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

    await fs.move(
      stagingDestination,
      destination,
    );

    return destination;
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