import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  createGenerationContext,
} from '../../src/generators/core/generation-context.js';
import {
  AuthGenerator,
} from '../../src/generators/features/auth/auth.generator.js';
import {
  createTemplateLoader,
} from '../../src/rendering/template-loader.js';
import {
  createTemplateRenderer,
} from '../../src/rendering/template-renderer.js';
import {
  getTemplatesDirectory,
} from '../../src/rendering/template-path.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('AuthGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function createContext(): Promise<{
    fs: ReturnType<typeof createFileSystem>;
    context: Awaited<
      ReturnType<typeof createGenerationContext>
    >;
  }> {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-auth-',
      ),
    );

    const fs = createFileSystem();

    await fs.writeFile(
      path.join(
        temporaryDirectory,
        'package.json',
      ),
      JSON.stringify({
        name: 'test-api',
        scripts: {},
        dependencies: {},
        devDependencies: {},
      }),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      auth: 'jwt',
    });

    const loader = createTemplateLoader(
      getTemplatesDirectory(),
      fs,
    );

    const renderer = createTemplateRenderer();

    const context = createGenerationContext(
      config,
      temporaryDirectory,
      fs,
      loader,
      renderer,
    );

    return {
      fs,
      context,
    };
  }

  it('has the auth generator contract', () => {
    const generator = new AuthGenerator();

    const jwtConfig = resolveConfig({
      projectName: 'test-api',
      auth: 'jwt',
    });

    const defaultConfig = resolveConfig({
      projectName: 'test-api',
    });

    expect(generator.name).toBe('auth');
    expect(generator.shouldRun(jwtConfig)).toBe(true);
    expect(generator.shouldRun(defaultConfig)).toBe(false);
  });

  it('generates JWT authentication infrastructure', async () => {
    const {
      fs,
      context,
    } = await createContext();

    const generator = new AuthGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'auth.module.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'auth.service.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'auth.controller.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'strategies',
          'jwt.strategy.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'guards',
          'jwt-auth.guard.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'types',
          'jwt-payload.type.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'dto',
          'register.dto.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          'auth',
          'dto',
          'login.dto.ts',
        ),
      ),
    ).toBe(true);
  });

  it('adds authentication runtime dependencies', async () => {
    const {
      fs,
      context,
    } = await createContext();

    const generator = new AuthGenerator();

    await generator.generate(context);

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'package.json',
        ),
      ),
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(
      packageJson.dependencies?.[
        '@nestjs/jwt'
      ],
    ).toBe('11.0.2');

    expect(
      packageJson.dependencies?.[
        '@nestjs/passport'
      ],
    ).toBe('11.0.5');

    expect(
      packageJson.dependencies?.bcrypt,
    ).toBe('6.0.0');

    expect(
      packageJson.dependencies?.passport,
    ).toBe('0.7.0');

    expect(
      packageJson.dependencies?.[
        'passport-jwt'
      ],
    ).toBe('4.0.1');
  });

  it('adds authentication type dependencies', async () => {
    const {
      fs,
      context,
    } = await createContext();

    const generator = new AuthGenerator();

    await generator.generate(context);

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'package.json',
        ),
      ),
    ) as {
      devDependencies?: Record<string, string>;
    };

    expect(
      packageJson.devDependencies?.[
        '@types/bcrypt'
      ],
    ).toBe('6.0.0');

    expect(
      packageJson.devDependencies?.[
        '@types/passport-jwt'
      ],
    ).toBe('4.0.1');
  });

  it('renders the JWT strategy correctly', async () => {
    const {
      fs,
      context,
    } = await createContext();

    const generator = new AuthGenerator();

    await generator.generate(context);

    const strategy = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'modules',
        'auth',
        'strategies',
        'jwt.strategy.ts',
      ),
    );

    expect(strategy).toContain(
      'PassportStrategy',
    );

    expect(strategy).toContain(
      'ExtractJwt.fromAuthHeaderAsBearerToken()',
    );

    expect(strategy).toContain(
      'JWT_SECRET',
    );
  });

  it('renders the PrismaService import correctly', async () => {
    const {
      fs,
      context,
    } = await createContext();

    const generator = new AuthGenerator();

    await generator.generate(context);

    const authService = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'modules',
        'auth',
        'auth.service.ts',
      ),
    );

    expect(authService).toContain(
      "from '../../infrastructure/prisma/prisma.service';",
    );

    expect(authService).not.toContain(
      "from '../../../infrastructure/prisma/prisma.service';",
    );
  });

  it('renders the authentication controller correctly', async () => {
    const {
      fs,
      context,
    } = await createContext();

    const generator = new AuthGenerator();

    await generator.generate(context);

    const controller = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'modules',
        'auth',
        'auth.controller.ts',
      ),
    );

    expect(controller).toContain(
      "@Controller('auth')",
    );

    expect(controller).toContain(
      "@Post('register')",
    );

    expect(controller).toContain(
      "@Post('login')",
    );

    expect(controller).toContain(
      "@Get('me')",
    );

    expect(controller).toContain(
      'JwtAuthGuard',
    );
  });
});