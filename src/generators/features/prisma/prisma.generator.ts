import path from 'node:path';
import type { ForgeKitConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { FORGEKIT_VERSIONS } from '../../../config/versions.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const PRISMA_TEMPLATES = [
  {
    source: 'prisma/prisma/schema.prisma',
    destination: 'prisma/schema.prisma',
  },
  {
    source:
      'prisma/src/infrastructure/prisma/prisma.module.ts.template',
    destination:
      'src/infrastructure/prisma/prisma.module.ts',
  },
  {
    source:
      'prisma/src/infrastructure/prisma/prisma.service.ts.template',
    destination:
      'src/infrastructure/prisma/prisma.service.ts',
  },
  {
    source:
      'prisma/prisma/migrations/0001_init/migration.sql',
    destination:
      'prisma/migrations/0001_init/migration.sql',
  },
] as const;

export class PrismaGenerator implements Generator {
  readonly name = 'prisma';

  shouldRun(config: ForgeKitConfig): boolean {
    return (
      config.database === 'postgres' &&
      config.orm === 'prisma'
    );
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(
      FORGEKIT_VERSIONS.dependencies.prisma,
    );

    await manifest.addDevDependencies(
      FORGEKIT_VERSIONS.devDependencies.prisma,
    );

    await manifest.addScripts({
      'db:generate': 'prisma generate',
      'db:migrate': 'prisma migrate dev',
      'db:migrate:deploy': 'prisma migrate deploy',
      'db:studio': 'prisma studio',
    });

    for (const template of PRISMA_TEMPLATES) {
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