import type { IronveilConfig } from '../../config/index.js';
import { createGenerators } from './generator-registry.js';
import type { Generator } from './generator.js';

export interface GenerationPlan {
  readonly generators: readonly Generator[];
}

export function createGenerationPlan(
  config: IronveilConfig,
  generators: readonly Generator[] = createGenerators(),
): GenerationPlan {
  const selectedGenerators = generators.filter(
    (generator) => generator.shouldRun(config),
  );

  return Object.freeze({
    generators: Object.freeze(selectedGenerators),
  });
}