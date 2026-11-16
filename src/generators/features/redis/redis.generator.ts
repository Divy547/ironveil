import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const REDIS_TEMPLATES = [
  {
    source:
      'redis/src/infrastructure/redis/redis.module.ts.template',
    destination:
      'src/infrastructure/redis/redis.module.ts',
  },
  {
    source:
      'redis/src/infrastructure/redis/redis.service.ts.template',
    destination:
      'src/infrastructure/redis/redis.service.ts',
  },
] as const;

export class RedisGenerator implements Generator {
  readonly name = 'redis';

  shouldRun(config: IronveilConfig): boolean {
    return config.redis;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(
      IRONVEIL_VERSIONS.dependencies.redis,
    );

    for (const template of REDIS_TEMPLATES) {
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
