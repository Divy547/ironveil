export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface PackageManagerSpec {
  readonly name: PackageManager;
  readonly displayName: string;
  readonly documentationUrl: string;
  readonly packageManagerField?: string;
  readonly install: string;
  readonly run: (script: string) => string;
  readonly exec: (binary: string, args?: string) => string;
  readonly prisma: (subcommand: string) => string;
}

const PACKAGE_MANAGER_SPECS: Record<PackageManager, PackageManagerSpec> = {
  npm: {
    name: 'npm',
    displayName: 'npm',
    documentationUrl: 'https://www.npmjs.com/',
    packageManagerField: undefined,
    install: 'npm install',
    run: (script: string) =>
      script === 'test' ? 'npm test' : `npm run ${script}`,
    exec: (binary: string, args?: string) =>
      args ? `npx ${binary} ${args}` : `npx ${binary}`,
    prisma: (subcommand: string) => `npx prisma ${subcommand}`,
  },
  pnpm: {
    name: 'pnpm',
    displayName: 'pnpm',
    documentationUrl: 'https://pnpm.io/',
    packageManagerField: 'pnpm@10.5.2',
    install: 'pnpm install',
    run: (script: string) =>
      script === 'test' ? 'pnpm test' : `pnpm run ${script}`,
    exec: (binary: string, args?: string) =>
      args ? `pnpm exec ${binary} ${args}` : `pnpm exec ${binary}`,
    prisma: (subcommand: string) => `pnpm exec prisma ${subcommand}`,
  },
  yarn: {
    name: 'yarn',
    displayName: 'yarn',
    documentationUrl: 'https://yarnpkg.com/',
    packageManagerField: 'yarn@1.22.22',
    install: 'yarn install',
    run: (script: string) => `yarn ${script}`,
    exec: (binary: string, args?: string) =>
      args ? `yarn ${binary} ${args}` : `yarn ${binary}`,
    prisma: (subcommand: string) => `yarn prisma ${subcommand}`,
  },
};

export function getPackageManagerSpec(
  pm: PackageManager = 'npm',
): PackageManagerSpec {
  const spec = PACKAGE_MANAGER_SPECS[pm];
  if (!spec) {
    throw new Error(`Unsupported package manager: ${pm}`);
  }
  return spec;
}
