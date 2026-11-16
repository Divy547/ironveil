import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const HEALTH_TEMPLATES = [
  {
    source: 'health/src/modules/health/health.module.ts.template',
    destination: 'src/modules/health/health.module.ts',
  },
  {
    source: 'health/src/modules/health/health.controller.ts.template',
    destination: 'src/modules/health/health.controller.ts',
  },
  {
    source: 'health/src/modules/health/prisma.health.ts.template',
    destination: 'src/modules/health/prisma.health.ts',
  },
] as const;

const REDIS_HEALTH_TEMPLATE = {
  source: 'health/src/modules/health/redis.health.ts.template',
  destination: 'src/modules/health/redis.health.ts',
} as const;

export class HealthGenerator implements Generator {
  readonly name = 'health';

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
      IRONVEIL_VERSIONS.dependencies.health,
    );

    const templates = context.config.redis
      ? [...HEALTH_TEMPLATES, REDIS_HEALTH_TEMPLATE]
      : HEALTH_TEMPLATES;

    for (const template of templates) {
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
