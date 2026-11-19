import type { Finding } from './types.js';

type Triple = readonly [number, number, number];

function parseVersion(version: string): Triple | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());

  return match === null
    ? undefined
    : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: Triple, b: Triple): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] as number) - (b[index] as number);
    if (difference !== 0) return difference;
  }

  return 0;
}

/**
 * Compares the Ironveil that created the project (recorded in `ironveil.json`)
 * with the running CLI. A project from an older CLI is normal; one from a
 * newer CLI means this CLI may not know about files or features it has.
 */
export function checkVersion(projectVersion: string, cliVersion: string): Finding[] {
  const project = parseVersion(projectVersion);
  const cli = parseVersion(cliVersion);

  if (project === undefined || cli === undefined) return [];

  const order = compare(project, cli);

  if (order === 0) return [];

  if (order < 0) {
    return [
      {
        check: 'version',
        severity: 'note',
        message: `This project was created with Ironveil ${projectVersion}; you are running ${cliVersion}. Features you add now may come from newer templates.`,
      },
    ];
  }

  return [
    {
      check: 'version',
      severity: 'warning',
      message: `This project was created with Ironveil ${projectVersion}, which is newer than the ${cliVersion} you are running.`,
      fix: 'Upgrade Ironveil before running generate or add on this project.',
    },
  ];
}
