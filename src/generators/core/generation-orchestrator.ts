import type { GenerationContext } from './generation-context.js';
import type { GenerationPlan } from './generation-plan.js';
import { GenerationError } from './generation-error.js';

export class GenerationOrchestrator {
  async generate(
    plan: GenerationPlan,
    context: GenerationContext,
  ): Promise<void> {
    for (const generator of plan.generators) {
      try {
        await generator.generate(context);
      } catch (error) {
        if (
          error instanceof GenerationError &&
          error.generatorName !== undefined
        ) {
          throw error;
        }

        const causeMessage =
          error instanceof Error
            ? error.message
            : String(error);

        throw new GenerationError(
          `Generator '${generator.name}' failed during project generation: ${causeMessage}`,
          {
            projectName: context.config.projectName,
            generatorName: generator.name,
            destination: context.destination,
            cause: error,
          },
        );
      }
    }
  }
}

export function createGenerationOrchestrator(): GenerationOrchestrator {
  return new GenerationOrchestrator();
}