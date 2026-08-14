import { describe, expect, it } from 'vitest';
import {
  createGenerators,
} from '../../src/generators/core/generator-registry.js';

describe('GeneratorRegistry', () => {
  it('registers the base, config, prisma, redis, auth, swagger, testing, docker, and ci generators', () => {
    const generators = createGenerators();

    expect(generators).toHaveLength(9);

    expect(
      generators.map(
        (generator) => generator.name,
      ),
    ).toEqual([
      'base',
      'config',
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