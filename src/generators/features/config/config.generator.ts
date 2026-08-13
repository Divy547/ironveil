import path from 'node:path';
import type { ForgeKitConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';

const CONFIG_TEMPLATES = [
  {
    source: 'config/.env.example',
    destination: '.env.example',
  },
  {
    source:
      'config/src/infrastructure/config/configuration.ts.template',
    destination:
      'src/infrastructure/config/configuration.ts',
  },
  {
    source:
      'config/src/infrastructure/config/environment.ts.template',
    destination:
      'src/infrastructure/config/environment.ts',
  },
] as const;

export class ConfigGenerator implements Generator {
  readonly name = 'config';

  shouldRun(_config: ForgeKitConfig): boolean {
    return true;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    for (const template of CONFIG_TEMPLATES) {
      const source = await context.loader.load(
        template.source,
      );

      const rendered = context.renderer.render(
        source,
        context.config,
      );

      await context.fs.writeFile(
        path.join(
          context.destination,
          template.destination,
        ),
        rendered,
      );
    }
  }
}