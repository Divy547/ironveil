import { describe, expect, it } from 'vitest';
import {
  createGenerators,
} from '../../src/generators/core/generator-registry.js';

describe('GeneratorRegistry', () => {
  it('registers the base, config, health, prisma, redis, auth, swagger, testing, docker, and ci generators', () => {
    const generators = createGenerators();

    expect(generators).toHaveLength(10);

    expect(
      generators.map(
        (generator) => generator.name,
      ),
    ).toEqual([
      'base',
      'config',
      'health',
      'prisma',
      'redis',
      'auth',
      'swagger',
      'testing',
      'docker',
      'ci',
    ]);
  });

  it('returns an immutable generator collection', () => {
    const generators = createGenerators();

    expect(Object.isFrozen(generators)).toBe(true);
  });
});