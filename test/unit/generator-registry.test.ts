import { describe, expect, it } from 'vitest';
import {
  createGenerators,
} from '../../src/generators/core/generator-registry.js';

describe('GeneratorRegistry', () => {
  it('registers the base, config, prisma, and auth generators', () => {
    const generators = createGenerators();

    expect(generators).toHaveLength(4);

    expect(
      generators.map(
        (generator) => generator.name,
      ),
    ).toEqual([
      'base',
      'config',
      'prisma',
      'auth',
    ]);
  });

  it('returns an immutable generator collection', () => {
    const generators = createGenerators();

    expect(Object.isFrozen(generators)).toBe(true);
  });
});