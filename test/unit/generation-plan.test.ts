import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  createGenerationPlan,
} from '../../src/generators/core/generation-plan.js';

describe('GenerationPlan', () => {
  it('includes the generators selected by the default configuration', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const plan = createGenerationPlan(config);

    expect(
      plan.generators.map(
        (generator) => generator.name,
      ),
    ).toEqual([
      'base',
      'config',
      'prisma',
    ]);
  });

  it('includes auth when JWT authentication is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      auth: 'jwt',
    });

    const plan = createGenerationPlan(config);

    expect(
      plan.generators.map(
        (generator) => generator.name,
      ),
    ).toEqual([
      'base',
      'config',
      'prisma',
      'auth',
    ]);
  });

  it('only includes generators that should run', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      auth: 'jwt',
    });

    const plan = createGenerationPlan(config);

    for (const generator of plan.generators) {
      expect(generator.shouldRun(config)).toBe(true);
    }
  });

  it('freezes the generation plan', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const plan = createGenerationPlan(config);

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.generators)).toBe(true);
  });
});