import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { getAgentFiles } from './agent-files.js';

export class AgentsGenerator implements Generator {
  readonly name = 'agents';

  shouldRun(config: IronveilConfig): boolean {
    return config.ai !== 'none';
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    for (const file of getAgentFiles(context.config)) {
      await context.fs.writeFile(
        path.join(context.destination, file.path),
        file.content,
      );
    }
  }
}
