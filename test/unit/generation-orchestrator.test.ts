import { describe, expect, it } from 'vitest';
import type { ForgeKitConfig } from '../../src/config/index.js';
import type { GenerationContext } from '../../src/generators/core/generation-context.js';
import type { Generator } from '../../src/generators/core/generator.js';
import type { GenerationPlan } from '../../src/generators/core/generation-plan.js';
import {
  GenerationOrchestrator,
} from '../../src/generators/core/generation-orchestrator.js';

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
});