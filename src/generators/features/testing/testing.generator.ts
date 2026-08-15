import path from 'node:path';
import type { ForgeKitConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { FORGEKIT_VERSIONS } from '../../../config/versions.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const TESTING_TEMPLATES = [
  {
    source: 'testing/jest.config.ts.template',
    destination: 'jest.config.ts',
  },
  {
    source: 'testing/test/jest-e2e.json.template',
    destination: 'test/jest-e2e.json',
  },
  {
    source: 'testing/src/app.module.spec.ts.template',
    destination: 'src/app.module.spec.ts',
  },
  {
    source: 'testing/test/app.e2e-spec.ts.template',
    destination: 'test/app.e2e-spec.ts',
  },
] as const;

export class TestingGenerator implements Generator {
  readonly name = 'testing';

  shouldRun(config: ForgeKitConfig): boolean {
    return config.testing;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDevDependencies(
      FORGEKIT_VERSIONS.devDependencies.testing,
    );

    await manifest.addScripts({
      test: 'jest',
      'test:watch': 'jest --watch',
      'test:cov': 'jest --coverage',
      'test:e2e': 'jest --config ./test/jest-e2e.json',
    });

    for (const template of TESTING_TEMPLATES) {
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
