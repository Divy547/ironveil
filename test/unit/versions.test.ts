import { describe, expect, it } from 'vitest';
import { IRONVEIL_VERSIONS } from '../../src/config/versions.js';

describe('IRONVEIL_VERSIONS centralized version registry', () => {
  describe('structure and completeness', () => {
    it('defines production dependencies for base and all features', () => {
      expect(IRONVEIL_VERSIONS.dependencies.base).toBeDefined();
      expect(IRONVEIL_VERSIONS.dependencies.auth).toBeDefined();
      expect(IRONVEIL_VERSIONS.dependencies.health).toBeDefined();
      expect(IRONVEIL_VERSIONS.dependencies.logging).toBeDefined();
      expect(IRONVEIL_VERSIONS.dependencies.security).toBeDefined();
      expect(IRONVEIL_VERSIONS.dependencies.prisma).toBeDefined();
      expect(IRONVEIL_VERSIONS.dependencies.redis).toBeDefined();
      expect(IRONVEIL_VERSIONS.dependencies.swagger).toBeDefined();

      expect(Object.keys(IRONVEIL_VERSIONS.dependencies.base).length).toBeGreaterThan(0);
      expect(Object.keys(IRONVEIL_VERSIONS.dependencies.auth).length).toBeGreaterThan(0);
      expect(Object.keys(IRONVEIL_VERSIONS.dependencies.prisma).length).toBeGreaterThan(0);
      expect(Object.keys(IRONVEIL_VERSIONS.dependencies.redis).length).toBeGreaterThan(0);
      expect(Object.keys(IRONVEIL_VERSIONS.dependencies.swagger).length).toBeGreaterThan(0);
    });

    it('defines devDependencies for base and features', () => {
      expect(IRONVEIL_VERSIONS.devDependencies.base).toBeDefined();
      expect(IRONVEIL_VERSIONS.devDependencies.auth).toBeDefined();
      expect(IRONVEIL_VERSIONS.devDependencies.prisma).toBeDefined();
      expect(IRONVEIL_VERSIONS.devDependencies.testing).toBeDefined();

      expect(Object.keys(IRONVEIL_VERSIONS.devDependencies.base).length).toBeGreaterThan(0);
      expect(Object.keys(IRONVEIL_VERSIONS.devDependencies.auth).length).toBeGreaterThan(0);
      expect(Object.keys(IRONVEIL_VERSIONS.devDependencies.prisma).length).toBeGreaterThan(0);
      expect(Object.keys(IRONVEIL_VERSIONS.devDependencies.testing).length).toBeGreaterThan(0);
    });

    it('defines tool versions for node, pnpm, and yarn', () => {
      expect(IRONVEIL_VERSIONS.tools.node).toBe('22');
      expect(IRONVEIL_VERSIONS.tools.pnpm).toBe('10.5.2');
      expect(IRONVEIL_VERSIONS.tools.yarn).toBe('1.22.22');
    });
  });

  describe('coupled-version invariants', () => {
    it('enforces Prisma Client and Prisma CLI exact version coupling', () => {
      const clientVersion = IRONVEIL_VERSIONS.dependencies.prisma['@prisma/client'];
      const cliVersion = IRONVEIL_VERSIONS.devDependencies.prisma.prisma;
      expect(clientVersion).toBe(cliVersion);
      expect(clientVersion).toBe('6.19.3');
    });

    it('enforces bcrypt and @types/bcrypt version coupling', () => {
      const bcryptVersion = IRONVEIL_VERSIONS.dependencies.auth.bcrypt;
      const typesBcryptVersion = IRONVEIL_VERSIONS.devDependencies.auth['@types/bcrypt'];
      expect(bcryptVersion).toBe(typesBcryptVersion);
      expect(bcryptVersion).toBe('6.0.0');
    });

    it('enforces passport-jwt and @types/passport-jwt version coupling', () => {
      const passportJwtVersion = IRONVEIL_VERSIONS.dependencies.auth['passport-jwt'];
      const typesPassportJwtVersion =
        IRONVEIL_VERSIONS.devDependencies.auth['@types/passport-jwt'];
      expect(passportJwtVersion).toBe(typesPassportJwtVersion);
      expect(passportJwtVersion).toBe('4.0.1');
    });

    it('enforces Jest and @types/jest major version compatibility', () => {
      const jestVersion = IRONVEIL_VERSIONS.devDependencies.testing.jest;
      const typesJestVersion = IRONVEIL_VERSIONS.devDependencies.testing['@types/jest'];
      expect(jestVersion).toBe('^30.0.0');
      expect(typesJestVersion).toBe('^30.0.0');
    });
  });
});
