import { describe, expect, it } from 'vitest';
import {
  createGenerators,
} from '../../src/generators/core/generator-registry.js';

describe('GeneratorRegistry', () => {
  it('registers the base, config, logging, security, error-handling, health, prisma, redis, queue, auth, swagger, testing, lint, docker, ci, agents, and manifest generators', () => {
    const generators = createGenerators();

    expect(generators).toHaveLength(17);

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
      'queue',
      'auth',
      'swagger',
      'testing',
      'lint',
      'docker',
      'ci',
      'agents',
      'manifest',
    ]);
  });

  it('returns an immutable generator collection', () => {
    const generators = createGenerators();

    expect(Object.isFrozen(generators)).toBe(true);
  });
});