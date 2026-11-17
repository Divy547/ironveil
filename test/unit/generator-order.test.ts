import {
  describe,
  expect,
  it,
} from 'vitest';

import { createGenerators } from '../../src/generators/core/generator-registry.js';

describe('generator ordering', () => {
  it('registers foundational generators before feature generators, agents last', () => {
    const generators = createGenerators();

    const names = generators.map(
      (generator) => generator.name,
    );

    expect(names).toEqual([
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
      'agents',
    ]);
  });

  it('returns a frozen generator collection', () => {
    const generators = createGenerators();

    expect(
      Object.isFrozen(generators),
    ).toBe(true);
  });
});