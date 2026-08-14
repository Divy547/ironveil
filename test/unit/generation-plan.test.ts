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
      'swagger',
      'docker',
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
      'swagger',
      'docker',
    ]);
  });

  it('includes redis when redis is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      redis: true,
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
      'redis',
      'swagger',
      'docker',
    ]);
  });

  it('includes docker when docker is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      docker: true,
    });

    const plan = createGenerationPlan(config);

    const names = plan.generators.map(
      (generator) => generator.name,
    );

    expect(names).toContain('docker');
    expect(names[names.length - 1]).toBe('docker');
  });

  it('excludes docker when docker is disabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      docker: false,
    });

    const plan = createGenerationPlan(config);

    expect(
      plan.generators.map(
        (generator) => generator.name,
      ),
    ).not.toContain('docker');
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