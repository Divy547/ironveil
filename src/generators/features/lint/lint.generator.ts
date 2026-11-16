import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import { createPackageManifest } from '../../../utils/package-manifest.js';

const LINT_TEMPLATES = [
  {
    source: 'lint/eslint.config.mjs',
    destination: 'eslint.config.mjs',
  },
  {
    source: 'lint/.prettierrc',
    destination: '.prettierrc',
  },
  {
    source: 'lint/.prettierignore',
    destination: '.prettierignore',
  },
] as const;

export class LintGenerator implements Generator {
  readonly name = 'lint';

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

    await manifest.addDevDependencies(
      IRONVEIL_VERSIONS.devDependencies.lint,
    );

    for (const template of LINT_TEMPLATES) {
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
