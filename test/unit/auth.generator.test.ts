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
  generateProject,
} from '../../src/generators/generate-project.js';
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
        'ironveil-auth-',
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

  async function generateAuth(): Promise<{
    read: (...segments: string[]) => Promise<string>;
    exists: (...segments: string[]) => Promise<boolean>;
  }> {
    const { fs, context } = await createContext();

    await new AuthGenerator().generate(context);

    return {
      read: (...segments) =>
        fs.readFile(
          path.join(
            temporaryDirectory,
            'src',
            'modules',
            'auth',
            ...segments,
          ),
        ),
      exists: (...segments) =>
        fs.exists(
          path.join(
            temporaryDirectory,
            'src',
            'modules',
            'auth',
            ...segments,
          ),
        ),
    };
  }

  it('renders the authentication controller correctly', async () => {
    const { read } = await generateAuth();

    const controller = await read('auth.controller.ts');

    expect(controller).toContain("@Controller('auth')");
    expect(controller).toContain("@Post('register')");
    expect(controller).toContain("@Post('login')");
    expect(controller).toContain("@Post('refresh')");
    expect(controller).toContain("@Post('logout')");
    expect(controller).toContain("@Get('me')");
    expect(controller).toContain("@CurrentUser('sub')");

    // Routes are protected globally, so the controller opts out explicitly
    // instead of attaching a guard to /auth/me.
    expect(controller).not.toContain('@UseGuards');
    expect(controller.match(/@Public\(\)/g)).toHaveLength(4);
  });

  it('generates the auth decorators', async () => {
    const { read, exists } = await generateAuth();

    for (const file of [
      'public.decorator.ts',
      'roles.decorator.ts',
      'current-user.decorator.ts',
    ]) {
      expect(await exists('decorators', file)).toBe(true);
    }

    expect(await read('decorators', 'public.decorator.ts')).toContain(
      'export const Public',
    );

    expect(await read('decorators', 'roles.decorator.ts')).toContain(
      'export const Roles = (...roles: Role[])',
    );

    const currentUser = await read(
      'decorators',
      'current-user.decorator.ts',
    );

    expect(currentUser).toContain('createParamDecorator');
    expect(currentUser).toContain('keyof JwtPayload');
  });

  it('generates global guards that honour @Public and @Roles', async () => {
    const { read, exists } = await generateAuth();

    expect(await exists('guards', 'roles.guard.ts')).toBe(true);

    const jwtGuard = await read('guards', 'jwt-auth.guard.ts');

    expect(jwtGuard).toContain('IS_PUBLIC_KEY');
    expect(jwtGuard).toContain('getAllAndOverride');
    expect(jwtGuard).toContain("AuthGuard('jwt')");

    const rolesGuard = await read('guards', 'roles.guard.ts');

    expect(rolesGuard).toContain('ROLES_KEY');
    expect(rolesGuard).toContain('requiredRoles.includes(user.role)');

    const authModule = await read('auth.module.ts');

    expect(authModule).toContain('provide: APP_GUARD');
    expect(authModule).toContain('useClass: JwtAuthGuard');
    expect(authModule).toContain('useClass: RolesGuard');
    // Authentication has to run before the role check.
    expect(authModule.indexOf('useClass: JwtAuthGuard')).toBeLessThan(
      authModule.indexOf('useClass: RolesGuard'),
    );
    expect(authModule).toContain('auth.accessTokenTtlSeconds');
  });

  it('carries the role in the JWT payload', async () => {
    const { read } = await generateAuth();

    expect(await read('types', 'jwt-payload.type.ts')).toContain(
      'readonly role: Role;',
    );

    expect(await read('types', 'role.type.ts')).toContain(
      "generated/prisma/client",
    );
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { read } = await generateAuth();

    const service = await read('auth.service.ts');

    // Only a hash of the opaque token is persisted.
    expect(service).toContain("createHash('sha256')");
    expect(service).toContain('tokenHash: hashToken(refreshToken)');
    expect(service).toContain('randomBytes(48)');

    // Rotation: revoke the presented token atomically, then issue a new pair
    // in the same family.
    expect(service).toContain('where: { id: stored.id, revokedAt: null }');
    expect(service).toContain(
      'this.issueTokens(stored.user, stored.familyId)',
    );

    // Reuse detection: presenting a revoked token kills the whole family.
    expect(service).toContain('if (stored.revokedAt)');
    expect(service).toContain('revokeFamily(stored.familyId)');

    // Each login starts a new family.
    expect(service).toContain('this.issueTokens(user, randomUUID())');

    expect(service).toContain('async logout(');
    expect(service).toContain('async me(');
  });

  it('never exposes the password hash from register or me', async () => {
    const { read } = await generateAuth();

    const service = await read('auth.service.ts');

    expect(service).toContain('select: USER_PROFILE_SELECT');
    expect(service).not.toMatch(/USER_PROFILE_SELECT = \{[^}]*passwordHash/);
  });

  it('validates the refresh token payload', async () => {
    const { read } = await generateAuth();

    const dto = await read('dto', 'refresh-token.dto.ts');

    expect(dto).toContain('refreshToken!: string;');
    expect(dto).toContain('@IsString()');
  });
});

describe('auth hardening in a generated project', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function generate(
    overrides: Parameters<typeof resolveConfig>[0] = {},
  ) {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'ironveil-auth-full-'),
    );

    const { destination } = await generateProject(
      resolveConfig({
        projectName: 'test-api',
        ...overrides,
      }),
      temporaryDirectory,
    );

    const fs = createFileSystem();

    return {
      read: (...segments: string[]) =>
        fs.readFile(path.join(destination, ...segments)),
    };
  }

  it('adds roles and refresh tokens to the Prisma schema and migration', async () => {
    const { read } = await generate({ auth: 'jwt' });

    const schema = await read('prisma/schema.prisma');

    expect(schema).toContain('enum Role {');
    expect(schema).toContain('role         Role     @default(USER)');
    expect(schema).toContain('refreshTokens RefreshToken[]');
    expect(schema).toContain('model RefreshToken {');
    expect(schema).toContain('tokenHash String    @unique');
    expect(schema).toContain('onDelete: Cascade');
    expect(schema).not.toContain('{{');

    const migration = await read(
      'prisma/migrations/0001_init/migration.sql',
    );

    expect(migration).toContain(
      `CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');`,
    );
    expect(migration).toContain(
      `"role" "Role" NOT NULL DEFAULT 'USER'`,
    );
    expect(migration).toContain('CREATE TABLE "RefreshToken"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "RefreshToken_tokenHash_key"',
    );
    expect(migration).toContain('"RefreshToken_userId_fkey"');
    expect(migration).not.toContain('{{');

    // The enum must exist before the table that uses it.
    expect(migration.indexOf('CREATE TYPE "Role"')).toBeLessThan(
      migration.indexOf('CREATE TABLE "User"'),
    );
  });

  it('keeps the Prisma schema free of auth models without JWT', async () => {
    const { read } = await generate({ auth: 'none' });

    const schema = await read('prisma/schema.prisma');

    expect(schema).not.toContain('Role');
    expect(schema).not.toContain('RefreshToken');
    expect(schema).not.toContain('{{');

    const migration = await read(
      'prisma/migrations/0001_init/migration.sql',
    );

    expect(migration).not.toContain('Role');
    expect(migration).not.toContain('RefreshToken');
    expect(migration).toContain('CREATE TABLE "User"');
    expect(migration).not.toContain('{{');
  });

  it('exposes token lifetimes through env, config and validation', async () => {
    const { read } = await generate({ auth: 'jwt' });

    const envExample = await read('.env.example');

    expect(envExample).toContain('JWT_ACCESS_TTL_SECONDS=900');
    expect(envExample).toContain('JWT_REFRESH_TTL_DAYS=7');

    const configuration = await read(
      'src/infrastructure/config/configuration.ts',
    );

    expect(configuration).toContain('process.env.JWT_ACCESS_TTL_SECONDS');
    expect(configuration).toContain('process.env.JWT_REFRESH_TTL_DAYS');
    expect(configuration).toContain('readonly accessTokenTtlSeconds: number;');

    const environment = await read(
      'src/infrastructure/config/environment.ts',
    );

    expect(environment).toContain('JWT_ACCESS_TTL_SECONDS: z.coerce');
    expect(environment).toContain('JWT_REFRESH_TTL_DAYS: z.coerce');
  });

  it('keeps health probes public only when JWT auth is enabled', async () => {
    const withAuth = await generate({ auth: 'jwt' });

    const protectedController = await withAuth.read(
      'src/modules/health/health.controller.ts',
    );

    expect(protectedController).toContain(
      "import { Public } from '../auth/decorators/public.decorator';",
    );
    expect(protectedController).toContain(
      "@Public()\n@Controller('health')",
    );

    const withoutAuth = await generate({ auth: 'none' });

    const openController = await withoutAuth.read(
      'src/modules/health/health.controller.ts',
    );

    expect(openController).not.toContain('Public');
    expect(openController).not.toContain('{{');
    expect(openController).toContain(
      "@SkipThrottle()\n@Controller('health')",
    );
  });

  it('documents the hardened auth flow in the generated README', async () => {
    const { read } = await generate({ auth: 'jwt' });

    const readme = await read('README.md');

    expect(readme).toContain('POST /auth/refresh');
    expect(readme).toContain('POST /auth/logout');
    expect(readme).toContain('@Public()');
    expect(readme).toContain('@Roles(Role.ADMIN)');
    expect(readme).toContain('@CurrentUser()');
    expect(readme).toContain('JWT_REFRESH_TTL_DAYS');
  });
});
