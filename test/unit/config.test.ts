import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  resolveConfig,
} from '../../src/config/index.js';

describe('ForgeKit configuration', () => {
  it('applies default configuration values', () => {
    const config = resolveConfig({
      projectName: 'bonfire-api',
    });

    expect(config).toEqual({
      projectName: 'bonfire-api',
      database: 'postgres',
      orm: 'prisma',
      redis: false,
      auth: 'none',
      swagger: true,
      docker: true,
      ci: true,
      testing: true,
      packageManager: 'npm',
    });
  });

  it('accepts valid feature configuration', () => {
    const config = resolveConfig({
      projectName: 'bonfire-api',
      redis: true,
      auth: 'jwt',
      swagger: true,
      docker: false,
      ci: true,
      testing: true,
    });

    expect(config.redis).toBe(true);
    expect(config.auth).toBe('jwt');
    expect(config.docker).toBe(false);
  });

  it('rejects an empty project name', () => {
    expect(() =>
      resolveConfig({
        projectName: '',
      }),
    ).toThrow(ConfigError);
  });

  it('rejects invalid project names', () => {
    expect(() =>
      resolveConfig({
        projectName: 'Bonfire API',
      }),
    ).toThrow(ConfigError);
  });

  it('rejects invalid auth values', () => {
    expect(() =>
      resolveConfig({
        projectName: 'bonfire-api',
        auth: 'oauth' as never,
      }),
    ).toThrow(ConfigError);
  });

  it('freezes the resolved configuration', () => {
    const config = resolveConfig({
      projectName: 'bonfire-api',
    });

    expect(Object.isFrozen(config)).toBe(true);
  });
});