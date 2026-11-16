import { describe, expect, it } from 'vitest';
import {
  createGenerators,
} from '../../src/generators/core/generator-registry.js';

describe('GeneratorRegistry', () => {
  it('registers the base, config, logging, security, error-handling, health, prisma, redis, auth, swagger, testing, lint, docker, and ci generators', () => {
    const generators = createGenerators();

    expect(generators).toHaveLength(14);

    expect(
      generators.map(
        (generator) => generator.name,
      ),
    ).toEqual([
      'base',
      'config',
      'logging',
      'security',
      'error-handling',
      'health',
      'prisma',
      'redis',
      'auth',
      'swagger',
      'testing',
      'lint',
      'docker',
      'ci',
    ]);
  });

  it('returns an immutable generator collection', () => {
    const generators = createGenerators();

    expect(Object.isFrozen(generators)).toBe(true);
  });
});