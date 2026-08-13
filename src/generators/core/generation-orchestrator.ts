import type { GenerationContext } from './generation-context.js';
import type { GenerationPlan } from './generation-plan.js';

export class GenerationOrchestrator {
  async generate(
    plan: GenerationPlan,
    context: GenerationContext,
  ): Promise<void> {
    for (const generator of plan.generators) {
      await generator.generate(context);
    }
  }
}

export function createGenerationOrchestrator(): GenerationOrchestrator {
  return new GenerationOrchestrator();
}