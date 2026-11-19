import path from 'node:path';
import type { IronveilConfig } from '../config/index.js';
import type { FileSystem } from '../utils/filesystem.js';
import { parseDotenv } from './dotenv.js';
import type { Finding } from './types.js';

const MIN_JWT_SECRET_LENGTH = 32;

/**
 * The variables the generated `environment.ts` declares with `requiredString`
 * (no default), so the app refuses to start without them. A unit test compares
 * this list with the schema `create` writes, so the two cannot drift apart.
 */
export function requiredEnvVars(config: IronveilConfig): string[] {
  const names: string[] = [];

  if (config.database === 'postgres' && config.orm === 'prisma') names.push('DATABASE_URL');
  if (config.redis) names.push('REDIS_URL');
  if (config.mail) names.push('MAIL_HOST', 'MAIL_FROM');
  if (config.auth === 'jwt') names.push('JWT_SECRET');

  return names;
}

export interface EnvCheckInput {
  readonly root: string;
  readonly config: IronveilConfig;
  /** The `.env.example` that `create` would write for this configuration. */
  readonly expectedExample: string;
  readonly fs: FileSystem;
}

export async function checkEnvironment(input: EnvCheckInput): Promise<Finding[]> {
  const findings: Finding[] = [];
  const expectedLines = lineByName(input.expectedExample);

  await checkExample(input, expectedLines, findings);
  await checkDotenv(input, findings);

  return findings;
}

async function checkExample(
  { root, fs }: EnvCheckInput,
  expectedLines: Map<string, string>,
  findings: Finding[],
): Promise<void> {
  const examplePath = path.join(root, '.env.example');

  if (!(await fs.exists(examplePath))) {
    findings.push({
      check: 'env',
      severity: 'warning',
      message: '.env.example is missing, so nobody can tell which variables the app reads.',
      fix: 'Restore it from version control, or recreate it from the variables in src/infrastructure/config/environment.ts.',
    });
    return;
  }

  const listed = parseDotenv(await fs.readFile(examplePath));

  for (const [name, line] of expectedLines) {
    if (!listed.has(name)) {
      findings.push({
        check: 'env',
        severity: 'warning',
        message: `.env.example does not list ${name}, which this project's features use.`,
        fix: `Add this line to .env.example: ${line}`,
      });
    }
  }
}

async function checkDotenv(
  { root, config, fs }: EnvCheckInput,
  findings: Finding[],
): Promise<void> {
  const dotenvPath = path.join(root, '.env');

  if (!(await fs.exists(dotenvPath))) {
    findings.push({
      check: 'env',
      severity: 'note',
      message:
        'No .env file found, so the values of the required variables were not checked. ' +
        'That is fine when they come from the process environment (Docker, CI, a host).',
      fix: 'For local development, copy .env.example to .env.',
    });
    return;
  }

  const values = parseDotenv(await fs.readFile(dotenvPath));

  for (const name of requiredEnvVars(config)) {
    const value = values.get(name);

    if (value === undefined || value === '') {
      findings.push({
        check: 'env',
        severity: 'warning',
        message:
          value === undefined
            ? `${name} is not set in .env, and the app will not start without it.`
            : `${name} is empty in .env, and the app will not start without it.`,
        fix: `Set ${name} in .env (see .env.example for the format).`,
      });
    }
  }

  const secret = values.get('JWT_SECRET');
  if (config.auth === 'jwt' && secret !== undefined && secret !== '' && secret.length < MIN_JWT_SECRET_LENGTH) {
    findings.push({
      check: 'env',
      severity: 'warning',
      message: `JWT_SECRET in .env is ${secret.length} characters; the app requires at least ${MIN_JWT_SECRET_LENGTH}.`,
      fix: 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"',
    });
  }
}

function lineByName(example: string): Map<string, string> {
  const lines = new Map<string, string>();

  for (const line of example.split(/\r?\n/)) {
    const name = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=/.exec(line.trim())?.[1];
    if (name !== undefined) lines.set(name, line.trim());
  }

  return lines;
}
