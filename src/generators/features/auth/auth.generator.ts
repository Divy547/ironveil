import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
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
      'auth/src/modules/auth/dto/register.dto.ts.template',
    destination:
      'src/modules/auth/dto/register.dto.ts',
  },
  {
    source:
      'auth/src/modules/auth/dto/login.dto.ts.template',
    destination:
      'src/modules/auth/dto/login.dto.ts',
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
  {
    source:
      'auth/src/modules/auth/auth.controller.ts.template',
    destination:
      'src/modules/auth/auth.controller.ts',
  },
  {
    source:
      'auth/src/modules/auth/types/role.type.ts.template',
    destination:
      'src/modules/auth/types/role.type.ts',
  },
  {
    source:
      'auth/src/modules/auth/types/token-pair.type.ts.template',
    destination:
      'src/modules/auth/types/token-pair.type.ts',
  },
  {
    source:
      'auth/src/modules/auth/decorators/public.decorator.ts.template',
    destination:
      'src/modules/auth/decorators/public.decorator.ts',
  },
  {
    source:
      'auth/src/modules/auth/decorators/roles.decorator.ts.template',
    destination:
      'src/modules/auth/decorators/roles.decorator.ts',
  },
  {
    source:
      'auth/src/modules/auth/decorators/current-user.decorator.ts.template',
    destination:
      'src/modules/auth/decorators/current-user.decorator.ts',
  },
  {
    source:
      'auth/src/modules/auth/guards/roles.guard.ts.template',
    destination:
      'src/modules/auth/guards/roles.guard.ts',
  },
  {
    source:
      'auth/src/modules/auth/dto/refresh-token.dto.ts.template',
    destination:
      'src/modules/auth/dto/refresh-token.dto.ts',
  },
] as const;

export class AuthGenerator implements Generator {
  readonly name = 'auth';

  shouldRun(config: IronveilConfig): boolean {
    return config.auth === 'jwt';
  }

  async generate(
    context: GenerationContext,
  ): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(
      IRONVEIL_VERSIONS.dependencies.auth,
    );

    await manifest.addDevDependencies(
      IRONVEIL_VERSIONS.devDependencies.auth,
    );

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