import type { GenerationContext } from './generation-context.js';

export interface Generator {
  generate(
    context: GenerationContext,
  ): Promise<void>;
}