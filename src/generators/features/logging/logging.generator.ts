import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import { createPackageManifest } from '../../../utils/package-manifest.js';

const LOGGING_TEMPLATES = [
  {
    source:
      'logging/src/infrastructure/logging/logging.module.ts.template',
    destination:
      'src/infrastructure/logging/logging.module.ts',
  },
] as const;

export class LoggingGenerator implements Generator {
  readonly name = 'logging';

  shouldRun(_config: IronveilConfig): boolean {
    return true;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(
      IRONVEIL_VERSIONS.dependencies.logging,
    );
    await manifest.addDevDependencies(
      IRONVEIL_VERSIONS.devDependencies.logging,
    );

    for (const template of LOGGING_TEMPLATES) {
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
