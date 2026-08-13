import path from 'node:path';
import type { Generator } from '../core/generator.js';
import type { GenerationContext } from '../core/generation-context.js';

const BASE_TEMPLATES = [
  {
    source: 'base/package.json',
    destination: 'package.json',
  },
  {
    source: 'base/tsconfig.json',
    destination: 'tsconfig.json',
  },
  {
    source: 'base/tsconfig.build.json',
    destination: 'tsconfig.build.json',
  },
  {
    source: 'base/nest-cli.json',
    destination: 'nest-cli.json',
  },
  {
    source: 'base/README.md',
    destination: 'README.md',
  },
  {
    source: 'base/src/main.ts.template',
    destination: 'src/main.ts',
  },
  {
    source: 'base/src/app.module.ts.template',
    destination: 'src/app.module.ts',
  },
] as const;

export class BaseProjectGenerator implements Generator {
  async generate(
    context: GenerationContext,
  ): Promise<void> {
    for (const template of BASE_TEMPLATES) {
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