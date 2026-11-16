import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import { createPackageManifest } from '../../../utils/package-manifest.js';

const SECURITY_TEMPLATES = [
  {
    source:
      'security/src/infrastructure/security/security.module.ts.template',
    destination:
      'src/infrastructure/security/security.module.ts',
  },
  {
    source:
      'security/src/infrastructure/security/security.setup.ts.template',
    destination:
      'src/infrastructure/security/security.setup.ts',
  },
] as const;

export class SecurityGenerator implements Generator {
  readonly name = 'security';

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
      IRONVEIL_VERSIONS.dependencies.security,
    );

    for (const template of SECURITY_TEMPLATES) {
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
