import { describe, expect, it } from 'vitest';
import type { ForgeKitConfig } from '../../src/config/index.js';
import type { GenerationContext } from '../../src/generators/core/generation-context.js';
import type { Generator } from '../../src/generators/core/generator.js';
import type { GenerationPlan } from '../../src/generators/core/generation-plan.js';
import {
  GenerationOrchestrator,
} from '../../src/generators/core/generation-orchestrator.js';
import { GenerationError } from '../../src/generators/core/generation-error.js';

function createGenerator(
  name: string,
  calls: string[],
): Generator {
  return {
    name,

    shouldRun(_config: ForgeKitConfig): boolean {
      return true;
    },

    async generate(
      _context: GenerationContext,
    ): Promise<void> {
      calls.push(name);
    },
  };
}

describe('GenerationOrchestrator', () => {
  it('executes generators in plan order', async () => {
    const calls: string[] = [];

    const first = createGenerator(
      'first',
      calls,
    );

    const second = createGenerator(
      'second',
      calls,
    );

    const plan: GenerationPlan = Object.freeze({
      generators: Object.freeze([
        first,
        second,
      ]),
    });

    const context = {} as GenerationContext;

    const orchestrator =
      new GenerationOrchestrator();

    await orchestrator.generate(
      plan,
      context,
    );

    expect(calls).toEqual([
      'first',
      'second',
    ]);
  });

  it('does not execute generators outside the plan', async () => {
    const calls: string[] = [];

    const generator = createGenerator(
      'selected',
      calls,
    );

    const unselected = createGenerator(
      'unselected',
      calls,
    );

    const plan: GenerationPlan = Object.freeze({
      generators: Object.freeze([
        generator,
      ]),
    });

    const context = {} as GenerationContext;

    const orchestrator =
      new GenerationOrchestrator();

    await orchestrator.generate(
      plan,
      context,
    );

    expect(calls).toEqual([
      'selected',
    ]);

    expect(calls).not.toContain(
      unselected.name,
    );
  });

  it('wraps generator failures with context and preserves original Error as cause', async () => {
    const originalError = new Error('Database schema invalid');
    const failingGenerator: Generator = {
      name: 'prisma',
      shouldRun: () => true,
      generate: async () => {
        throw originalError;
      },
    };

    const plan: GenerationPlan = Object.freeze({
      generators: Object.freeze([failingGenerator]),
    });

    const context = {
      config: { projectName: 'fail-api' },
      destination: '/tmp/fail-api',
    } as unknown as GenerationContext;

    const orchestrator = new GenerationOrchestrator();

    try {
      await orchestrator.generate(plan, context);
      expect.unreachable('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      const genError = error as GenerationError;
      expect(genError.message).toContain("Generator 'prisma' failed");
      expect(genError.message).toContain('Database schema invalid');
      expect(genError.generatorName).toBe('prisma');
      expect(genError.projectName).toBe('fail-api');
      expect(genError.destination).toBe('/tmp/fail-api');
      expect(genError.cause).toBe(originalError);
    }
  });

  it('handles non-Error thrown values safely and preserves them as cause', async () => {
    const failingGenerator: Generator = {
      name: 'docker',
      shouldRun: () => true,
      generate: async () => {
        throw 'network timeout';
      },
    };

    const plan: GenerationPlan = Object.freeze({
      generators: Object.freeze([failingGenerator]),
    });

    const context = {
      config: { projectName: 'non-error-api' },
      destination: '/tmp/non-error-api',
    } as unknown as GenerationContext;

    const orchestrator = new GenerationOrchestrator();

    try {
      await orchestrator.generate(plan, context);
      expect.unreachable('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      const genError = error as GenerationError;
      expect(genError.message).toContain("Generator 'docker' failed");
      expect(genError.message).toContain('network timeout');
      expect(genError.generatorName).toBe('docker');
      expect(genError.projectName).toBe('non-error-api');
      expect(genError.cause).toBe('network timeout');
    }
  });
});