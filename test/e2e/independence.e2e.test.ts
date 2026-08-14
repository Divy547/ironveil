import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import { resolveConfig } from '../../src/config/index.js';
import {
  createGeneratedProject,
} from './helpers/generated-project.js';

async function scanFilesRecursively(
  dir: string,
  ignoredDirs: string[] = ['node_modules', 'dist', '.git'],
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.includes(entry.name)) {
        files.push(
          ...(await scanFilesRecursively(
            path.join(dir, entry.name),
            ignoredDirs,
          )),
        );
      }
    } else if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

describe('ForgeKit project independence E2E', () => {
  let project:
    | Awaited<
        ReturnType<
          typeof createGeneratedProject
        >
      >
    | undefined;

  afterEach(async () => {
    await project?.cleanup();
    project = undefined;
  });

  it(
    'generates a project completely independent from ForgeKit at build and runtime',
    async () => {
      project =
        await createGeneratedProject(
          resolveConfig({
            projectName:
              'generated-independent-api',
            database: 'postgres',
            orm: 'prisma',
            redis: true,
            auth: 'jwt',
            swagger: true,
            docker: true,
            ci: true,
            testing: true,
          }),
          'forgekit-independence-e2e',
        );

      // 1. Verify package.json contains zero ForgeKit dependencies
      const packageJson = JSON.parse(
        await project.fs.readFile(
          `${project.root}/package.json`,
        ),
      ) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };

      expect(packageJson.name).toBe(
        'generated-independent-api',
      );
      expect(packageJson.dependencies?.forgekit).toBeUndefined();
      expect(packageJson.devDependencies?.forgekit).toBeUndefined();

      // Verify scripts do not invoke forgekit
      for (const [scriptName, scriptCmd] of Object.entries(packageJson.scripts ?? {})) {
        expect(scriptCmd).not.toContain('forgekit');
        expect(scriptCmd).not.toContain('ForgeKit');
      }

      // 2. Scan all generated code files for ForgeKit imports or dependencies
      const sourceAndTestFiles = await scanFilesRecursively(project.root);
      const codeFiles = sourceAndTestFiles.filter((filePath) =>
        /\.(ts|js|json|yml|yaml)$/.test(filePath) &&
        !filePath.endsWith('package.json'),
      );

      for (const file of codeFiles) {
        const content = await readFile(file, 'utf8');
        expect(content).not.toContain('from "forgekit"');
        expect(content).not.toContain("from 'forgekit'");
        expect(content).not.toContain('require("forgekit")');
        expect(content).not.toContain("require('forgekit')");
      }

      // 3. Verify no workspace or monorepo links exist
      expect(
        await project.fs.exists(
          `${project.root}/pnpm-workspace.yaml`,
        ),
      ).toBe(false);

      // 4. Verify standalone install, prisma generate, typecheck, and build
      await project.writeEnv({
        databaseUrl:
          'postgresql://postgres:postgres@localhost:5432/forgekit-independence-e2e?schema=public',
        redisUrl: 'redis://localhost:6379',
        jwtSecret:
          'forgekit-e2e-super-secret-key-2026-change-me',
      });

      await project.install();
      await project.prismaGenerate();
      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/dist/main.js`,
        ),
      ).toBe(true);
    },
    180_000,
  );
});