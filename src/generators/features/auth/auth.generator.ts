import path from 'node:path';
import type { ForgeKitConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import {
  createPackageManifest,
} from '../../../utils/package-manifest.js';

const AUTH_TEMPLATES = [
  {
    source:
      'auth/src/modules/auth/auth.module.ts.template',
    destination:
      'src/modules/auth/auth.module.ts',
  },
  {
    source:
      'auth/src/modules/auth/auth.service.ts.template',
    destination:
      'src/modules/auth/auth.service.ts',
  },
  {
    source:
      'auth/src/modules/auth/strategies/jwt.strategy.ts.template',
    destination:
      'src/modules/auth/strategies/jwt.strategy.ts',
  },
  {
    source:
      'auth/src/modules/auth/guards/jwt-auth.guard.ts.template',
    destination:
      'src/modules/auth/guards/jwt-auth.guard.ts',
  },
  {
    source:
      'auth/src/modules/auth/types/jwt-payload.type.ts.template',
    destination:
      'src/modules/auth/types/jwt-payload.type.ts',
  },
] as const;

export class AuthGenerator implements Generator {
  readonly name = 'auth';

  shouldRun(config: ForgeKitConfig): boolean {
    return config.auth === 'jwt';
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies({
      '@nestjs/jwt': '11.0.2',
      '@nestjs/passport': '11.0.5',
      bcrypt: '6.0.0',
      passport: '0.7.0',
      'passport-jwt': '4.0.1',
    });

    for (const template of AUTH_TEMPLATES) {
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