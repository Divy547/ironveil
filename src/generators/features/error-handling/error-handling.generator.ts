import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';

const ERROR_HANDLING_TEMPLATES = [
  {
    source:
      'error-handling/src/common/filters/all-exceptions.filter.ts.template',
    destination:
      'src/common/filters/all-exceptions.filter.ts',
  },
] as const;

export class ErrorHandlingGenerator implements Generator {
  readonly name = 'error-handling';

  shouldRun(_config: IronveilConfig): boolean {
    return true;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    for (const template of ERROR_HANDLING_TEMPLATES) {
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
