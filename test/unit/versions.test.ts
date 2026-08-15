import { describe, expect, it } from 'vitest';
import { FORGEKIT_VERSIONS } from '../../src/config/versions.js';

describe('FORGEKIT_VERSIONS centralized version registry', () => {
  describe('structure and completeness', () => {
    it('defines production dependencies for base and all features', () => {
      expect(FORGEKIT_VERSIONS.dependencies.base).toBeDefined();
      expect(FORGEKIT_VERSIONS.dependencies.auth).toBeDefined();
      expect(FORGEKIT_VERSIONS.dependencies.prisma).toBeDefined();
      expect(FORGEKIT_VERSIONS.dependencies.redis).toBeDefined();
      expect(FORGEKIT_VERSIONS.dependencies.swagger).toBeDefined();

      expect(Object.keys(FORGEKIT_VERSIONS.dependencies.base).length).toBeGreaterThan(0);
      expect(Object.keys(FORGEKIT_VERSIONS.dependencies.auth).length).toBeGreaterThan(0);
      expect(Object.keys(FORGEKIT_VERSIONS.dependencies.prisma).length).toBeGreaterThan(0);
      expect(Object.keys(FORGEKIT_VERSIONS.dependencies.redis).length).toBeGreaterThan(0);
      expect(Object.keys(FORGEKIT_VERSIONS.dependencies.swagger).length).toBeGreaterThan(0);
    });

    it('defines devDependencies for base and features', () => {
      expect(FORGEKIT_VERSIONS.devDependencies.base).toBeDefined();
      expect(FORGEKIT_VERSIONS.devDependencies.auth).toBeDefined();
      expect(FORGEKIT_VERSIONS.devDependencies.prisma).toBeDefined();
      expect(FORGEKIT_VERSIONS.devDependencies.testing).toBeDefined();

      expect(Object.keys(FORGEKIT_VERSIONS.devDependencies.base).length).toBeGreaterThan(0);
      expect(Object.keys(FORGEKIT_VERSIONS.devDependencies.auth).length).toBeGreaterThan(0);
      expect(Object.keys(FORGEKIT_VERSIONS.devDependencies.prisma).length).toBeGreaterThan(0);
      expect(Object.keys(FORGEKIT_VERSIONS.devDependencies.testing).length).toBeGreaterThan(0);
    });

    it('defines tool versions for node, pnpm, and yarn', () => {
      expect(FORGEKIT_VERSIONS.tools.node).toBe('22');
      expect(FORGEKIT_VERSIONS.tools.pnpm).toBe('10.5.2');
      expect(FORGEKIT_VERSIONS.tools.yarn).toBe('1.22.22');
    });
  });

  describe('coupled-version invariants', () => {
    it('enforces Prisma Client and Prisma CLI exact version coupling', () => {
      const clientVersion = FORGEKIT_VERSIONS.dependencies.prisma['@prisma/client'];
      const cliVersion = FORGEKIT_VERSIONS.devDependencies.prisma.prisma;
      expect(clientVersion).toBe(cliVersion);
      expect(clientVersion).toBe('6.19.3');
    });

    it('enforces bcrypt and @types/bcrypt version coupling', () => {
      const bcryptVersion = FORGEKIT_VERSIONS.dependencies.auth.bcrypt;
      const typesBcryptVersion = FORGEKIT_VERSIONS.devDependencies.auth['@types/bcrypt'];
      expect(bcryptVersion).toBe(typesBcryptVersion);
      expect(bcryptVersion).toBe('6.0.0');
    });

    it('enforces passport-jwt and @types/passport-jwt version coupling', () => {
      const passportJwtVersion = FORGEKIT_VERSIONS.dependencies.auth['passport-jwt'];
      const typesPassportJwtVersion =
        FORGEKIT_VERSIONS.devDependencies.auth['@types/passport-jwt'];
      expect(passportJwtVersion).toBe(typesPassportJwtVersion);
      expect(passportJwtVersion).toBe('4.0.1');
    });

    it('enforces Jest and @types/jest major version compatibility', () => {
      const jestVersion = FORGEKIT_VERSIONS.devDependencies.testing.jest;
      const typesJestVersion = FORGEKIT_VERSIONS.devDependencies.testing['@types/jest'];
      expect(jestVersion).toBe('^30.0.0');
      expect(typesJestVersion).toBe('^30.0.0');
    });
  });
});
