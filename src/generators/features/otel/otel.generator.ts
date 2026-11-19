import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import { createPackageManifest } from '../../../utils/package-manifest.js';

const OTEL_TEMPLATES = [
  {
    source: 'otel/src/infrastructure/telemetry/telemetry-options.ts.template',
    destination: 'src/infrastructure/telemetry/telemetry-options.ts',
  },
  {
    source: 'otel/src/infrastructure/telemetry/telemetry-state.ts.template',
    destination: 'src/infrastructure/telemetry/telemetry-state.ts',
  },
  {
    source: 'otel/src/infrastructure/telemetry/telemetry-sdk.ts.template',
    destination: 'src/infrastructure/telemetry/telemetry-sdk.ts',
  },
  {
    source: 'otel/src/infrastructure/telemetry/tracing.ts.template',
    destination: 'src/infrastructure/telemetry/tracing.ts',
  },
  {
    source: 'otel/src/infrastructure/telemetry/telemetry.module.ts.template',
    destination: 'src/infrastructure/telemetry/telemetry.module.ts',
  },
] as const;

export class OtelGenerator implements Generator {
  readonly name = 'otel';

  shouldRun(config: IronveilConfig): boolean {
    return config.otel;
  }

  async generate(context: GenerationContext): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(IRONVEIL_VERSIONS.dependencies.otel);

    // Nothing to instrument without Redis, so the package stays out.
    if (context.config.redis) {
      await manifest.addDependencies(IRONVEIL_VERSIONS.dependencies.otelRedis);
    }

    for (const template of OTEL_TEMPLATES) {
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
