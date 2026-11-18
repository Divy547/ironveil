import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const QUEUE_TEMPLATES = [
  {
    source: 'queue/src/infrastructure/queue/queue.module.ts.template',
    destination: 'src/infrastructure/queue/queue.module.ts',
  },
  {
    source: 'queue/src/infrastructure/queue/redis-connection.ts.template',
    destination: 'src/infrastructure/queue/redis-connection.ts',
  },
] as const;

export class QueueGenerator implements Generator {
  readonly name = 'queue';

  shouldRun(config: IronveilConfig): boolean {
    return config.queue;
  }

  async generate(context: GenerationContext): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(
      IRONVEIL_VERSIONS.dependencies.queue,
    );

    for (const template of QUEUE_TEMPLATES) {
      const source = await context.loader.load(template.source);

      const rendered = context.renderer.render(
        source,
        context.config,
      );

      await context.fs.writeFile(
        path.join(context.destination, template.destination),
        rendered,
      );
    }
  }
}
