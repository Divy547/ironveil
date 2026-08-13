import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import type { ForgeKitConfig } from '../../src/config/index.js';
import type { GenerationContext } from '../../src/generators/core/generation-context.js';
import type { Generator } from '../../src/generators/core/generator.js';
import {
    createGenerationPlan,
} from '../../src/generators/core/generation-plan.js';

function createConditionalGenerator(
    name: string,
    shouldRun: (config: ForgeKitConfig) => boolean,
): Generator {
    return {
        name,

        shouldRun,

        async generate(
            _context: GenerationContext,
        ): Promise<void> { },
    };
}

describe('Generator composition', () => {
    it('selects enabled generators', () => {
        const config = resolveConfig({
            projectName: 'test-api',
            redis: true,
            auth: 'jwt',
            docker: false,
        });

        const generators: Generator[] = [
            createConditionalGenerator(
                'base',
                () => true,
            ),
            createConditionalGenerator(
                'redis',
                (config) => config.redis,
            ),
            createConditionalGenerator(
                'auth',
                (config) => config.auth !== 'none',
            ),
            createConditionalGenerator(
                'docker',
                (config) => config.docker,
            ),
        ];

        const plan = createGenerationPlan(
            config,
            generators,
        );

        expect(
            plan.generators.map(
                (generator) => generator.name,
            ),
        ).toEqual([
            'base',
            'redis',
            'auth',
        ]);
    });

    it('excludes disabled generators', () => {
        const config = resolveConfig({
            projectName: 'test-api',
            redis: false,
            auth: 'none',
            docker: false,
        });

        const generators: Generator[] = [
            createConditionalGenerator(
                'redis',
                (config) => config.redis,
            ),
            createConditionalGenerator(
                'auth',
                (config) => config.auth !== 'none',
            ),
            createConditionalGenerator(
                'docker',
                (config) => config.docker,
            ),
        ];

        const plan = createGenerationPlan(
            config,
            generators,
        );

        expect(plan.generators).toHaveLength(0);
    });

    it('preserves generator registration order', () => {
        const config = resolveConfig({
            projectName: 'test-api',
        });

        const generators: Generator[] = [
            createConditionalGenerator(
                'first',
                () => true,
            ),
            createConditionalGenerator(
                'second',
                () => true,
            ),
            createConditionalGenerator(
                'third',
                () => true,
            ),
        ];

        const plan = createGenerationPlan(
            config,
            generators,
        );

        expect(
            plan.generators.map(
                (generator) => generator.name,
            ),
        ).toEqual([
            'first',
            'second',
            'third',
        ]);
    });
});