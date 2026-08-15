import path from 'node:path';
import type { ForgeKitConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { FORGEKIT_VERSIONS } from '../../../config/versions.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const SWAGGER_TEMPLATES = [
  {
    source:
      'swagger/src/infrastructure/swagger/swagger.setup.ts.template',
    destination:
      'src/infrastructure/swagger/swagger.setup.ts',
  },
] as const;

export class SwaggerGenerator implements Generator {
  readonly name = 'swagger';

  shouldRun(config: ForgeKitConfig): boolean {
    return config.swagger;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(
      FORGEKIT_VERSIONS.dependencies.swagger,
    );

    for (const template of SWAGGER_TEMPLATES) {
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
