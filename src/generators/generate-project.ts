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
): Promise<string> {
  const destination = path.resolve(
    cwd,
    config.projectName,
  );

  const fs = createFileSystem();

  if (await fs.exists(destination)) {
    throw new GenerationError(
      `Destination already exists: ${destination}`,
    );
  }

  const loader = createTemplateLoader(
    getTemplatesDirectory(),
    fs,
  );

  const renderer = createTemplateRenderer();

  const context = createGenerationContext(
    config,
    destination,
    fs,
    loader,
    renderer,
  );

  const plan = createGenerationPlan(config);

  const orchestrator =
    createGenerationOrchestrator();

  await orchestrator.generate(
    plan,
    context,
  );

  return destination;
}