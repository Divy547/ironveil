import path from 'node:path';
import type { FileSystem } from './filesystem.js';

export interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly private?: boolean;
  readonly license?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly [key: string]: unknown;
}

export interface PackageManifest {
  read(): Promise<PackageJson>;
  write(manifest: PackageJson): Promise<void>;
  addDependencies(
    dependencies: Record<string, string>,
  ): Promise<void>;
  addDevDependencies(
    dependencies: Record<string, string>,
  ): Promise<void>;
  addScripts(
    scripts: Record<string, string>,
  ): Promise<void>;
}

export function createPackageManifest(
  destination: string,
  fs: FileSystem,
): PackageManifest {
  const packagePath = path.join(
    destination,
    'package.json',
  );

  return {
    async read(): Promise<PackageJson> {
      const content = await fs.readFile(packagePath);

      return JSON.parse(content) as PackageJson;
    },

    async write(
      manifest: PackageJson,
    ): Promise<void> {
      await fs.writeFile(
        packagePath,
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    },

    async addDependencies(
      dependencies: Record<string, string>,
    ): Promise<void> {
      const manifest = await this.read();

      const currentDependencies =
        manifest.dependencies ?? {};

      await this.write({
        ...manifest,
        dependencies: {
          ...currentDependencies,
          ...dependencies,
        },
      });
    },

    async addDevDependencies(
      dependencies: Record<string, string>,
    ): Promise<void> {
      const manifest = await this.read();

      const currentDevDependencies =
        manifest.devDependencies ?? {};

      await this.write({
        ...manifest,
        devDependencies: {
          ...currentDevDependencies,
          ...dependencies,
        },
      });
    },

    async addScripts(
      scripts: Record<string, string>,
    ): Promise<void> {
      const manifest = await this.read();

      const currentScripts =
        manifest.scripts ?? {};

      await this.write({
        ...manifest,
        scripts: {
          ...currentScripts,
          ...scripts,
        },
      });
    },
  };
}