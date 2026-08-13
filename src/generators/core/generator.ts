import type { ForgeKitConfig } from '../../config/index.js';
import type { GenerationContext } from './generation-context.js';

export interface Generator {
  readonly name: string;

  shouldRun(config: ForgeKitConfig): boolean;

  generate(
    context: GenerationContext,
  ): Promise<void>;
}