import path from 'node:path';
import type { ForgeKitConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const DOCKER_TEMPLATES = [
  {
    source: 'docker/Dockerfile.template',
    destination: 'Dockerfile',
  },
  {
    source: 'docker/docker-compose.yml.template',
    destination: 'docker-compose.yml',
  },
  {
    source: 'docker/.dockerignore.template',
    destination: '.dockerignore',
  },
] as const;

export class DockerGenerator implements Generator {
  readonly name = 'docker';

  shouldRun(config: ForgeKitConfig): boolean {
    return config.docker;
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addScripts({
      'docker:up': 'docker compose up --build',
      'docker:down': 'docker compose down',
    });

    for (const template of DOCKER_TEMPLATES) {
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
