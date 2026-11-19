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

  describe('queue', () => {
    it('pins @nestjs/bullmq and bullmq as production dependencies', () => {
      expect(IRONVEIL_VERSIONS.dependencies.queue).toEqual({
        '@nestjs/bullmq': '11.0.5',
        bullmq: '5.81.5',
      });
    });
  });

  describe('mail', () => {
    it('pins nodemailer as a production dependency and its types as a devDependency', () => {
      expect(IRONVEIL_VERSIONS.dependencies.mail).toEqual({
        nodemailer: '10.6.0',
      });
      expect(IRONVEIL_VERSIONS.devDependencies.mail).toEqual({
        '@types/nodemailer': '8.0.2',
      });
    });
  });

  describe('otel', () => {
    it('pins the SDK, the OTLP exporter and the instrumentations exactly', () => {
      expect(IRONVEIL_VERSIONS.dependencies.otel).toEqual({
        '@opentelemetry/api': '1.10.0',
        '@opentelemetry/sdk-node': '0.301.2',
        '@opentelemetry/exporter-trace-otlp-http': '0.301.2',
        '@opentelemetry/instrumentation-http': '0.301.2',
        '@opentelemetry/instrumentation-express': '0.73.0',
        '@opentelemetry/instrumentation-nestjs-core': '0.72.1',
        '@opentelemetry/instrumentation-pino': '0.71.0',
        '@prisma/instrumentation': '6.19.3',
      });
    });

    it('keeps the ioredis instrumentation in its own group, used only with Redis', () => {
      expect(IRONVEIL_VERSIONS.dependencies.otelRedis).toEqual({
        '@opentelemetry/instrumentation-ioredis': '0.73.0',
      });
      expect(IRONVEIL_VERSIONS.dependencies.otel).not.toHaveProperty(
        '@opentelemetry/instrumentation-ioredis',
      );
    });

    it('adds no devDependencies', () => {
      expect(IRONVEIL_VERSIONS.devDependencies).not.toHaveProperty('otel');
    });

    it('pins every package exactly, with no ranges', () => {
      for (const group of [
        IRONVEIL_VERSIONS.dependencies.otel,
        IRONVEIL_VERSIONS.dependencies.otelRedis,
      ]) {
        for (const [name, version] of Object.entries(group)) {
          expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
        }
      }
    });
  });

  describe('coupled-version invariants', () => {
    it('enforces @prisma/instrumentation and Prisma Client exact version coupling', () => {
      expect(IRONVEIL_VERSIONS.dependencies.otel['@prisma/instrumentation']).toBe(
        IRONVEIL_VERSIONS.dependencies.prisma['@prisma/client'],
      );
    });

    it('keeps the experimental OpenTelemetry packages on one release line', () => {
      const otel = IRONVEIL_VERSIONS.dependencies.otel;

      expect(otel['@opentelemetry/exporter-trace-otlp-http']).toBe(
        otel['@opentelemetry/sdk-node'],
      );
      expect(otel['@opentelemetry/instrumentation-http']).toBe(otel['@opentelemetry/sdk-node']);
    });

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
