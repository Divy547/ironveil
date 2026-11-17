import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { buildAgentsMd } from './agents-md.js';

export class AgentsGenerator implements Generator {
  readonly name = 'agents';

  shouldRun(_config: IronveilConfig): boolean {
    return true;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    await context.fs.writeFile(
      path.join(context.destination, 'AGENTS.md'),
      buildAgentsMd(context.config),
    );
  }
}
