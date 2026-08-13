import {
    mkdtemp,
    rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
    generateProject,
} from '../../src/generators/generate-project.js';

describe('generateProject', () => {
    let temporaryDirectory: string;

    afterEach(async () => {
        if (temporaryDirectory) {
            await rm(temporaryDirectory, {
                recursive: true,
                force: true,
            });
        }
    });

    it('generates a project in the requested directory', async () => {
        temporaryDirectory = await mkdtemp(
            path.join(
                os.tmpdir(),
                'forgekit-generation-',
            ),
        );

        const config = resolveConfig({
            projectName: 'test-api',
        });

        const destination = await generateProject(
            config,
            temporaryDirectory,
        );

        expect(destination).toBe(
            path.join(
                temporaryDirectory,
                'test-api',
            ),
        );
    });


    it('rejects an existing destination', async () => {
        temporaryDirectory = await mkdtemp(
            path.join(
                os.tmpdir(),
                'forgekit-generation-',
            ),
        );

        const destination = path.join(
            temporaryDirectory,
            'test-api',
        );

        const fs = await import('node:fs/promises');

        await fs.mkdir(destination);

        const config = resolveConfig({
            projectName: 'test-api',
        });

        await expect(
            generateProject(
                config,
                temporaryDirectory,
            ),
        ).rejects.toThrow(
            'Destination already exists',
        );
    });
});