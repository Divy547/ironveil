import path from 'node:path';
import type { ForgeKitConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';

const CI_TEMPLATES = [
  {
    source: 'ci/.github/workflows/ci.yml.template',
    destination: '.github/workflows/ci.yml',
  },
] as const;

export class CiGenerator implements Generator {
  readonly name = 'ci';

  shouldRun(config: ForgeKitConfig): boolean {
    return config.ci;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    for (const template of CI_TEMPLATES) {
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
