import { resolveConfig, type Ai, type Auth, type IronveilConfig } from '../config/index.js';
import { AddError } from './add-error.js';

/** Features `ironveil add` can apply in this version. */
export const ADDABLE_FEATURES = [
  'ci',
  'ai',
  'docker',
  'testing',
  'swagger',
  'redis',
  'auth',
  'queue',
  'mail',
  'otel',
] as const;

export type AddableFeature = (typeof ADDABLE_FEATURES)[number];

export const AI_MODES = ['agents', 'all'] as const;

// Each mode includes the one before it, so adding never has to remove files.
const AI_RANK: Record<Ai, number> = { none: 0, agents: 1, all: 2 };

export interface FeatureChange {
  readonly feature: AddableFeature;
  /** The manifest value to record (`true`, the ai mode, or `jwt`). */
  readonly value: boolean | Ai | Auth;
  /** The project's config once the feature is added. */
  readonly after: IronveilConfig;
  /** True when the project already has the feature (or more of it). */
  readonly alreadyEnabled: boolean;
}

const isAddable = (value: string): value is AddableFeature =>
  (ADDABLE_FEATURES as readonly string[]).includes(value);

export function describeFeatureChange(
  before: IronveilConfig,
  feature: string,
  mode: string | undefined,
): FeatureChange {
  if (!isAddable(feature)) {
    throw new AddError(
      `Unknown feature "${feature}". Features you can add: ${ADDABLE_FEATURES.join(', ')}.`,
    );
  }

  if (feature === 'ai') {
    const requested = mode ?? 'agents';
    if (!(AI_MODES as readonly string[]).includes(requested)) {
      throw new AddError(
        `Invalid ai mode "${requested}". Use one of: ${AI_MODES.join(', ')}.`,
      );
    }
    const value = requested as Ai;

    return {
      feature,
      value,
      after: resolveConfig({ ...before, ai: value }),
      alreadyEnabled: AI_RANK[before.ai] >= AI_RANK[value],
    };
  }

  if (mode !== undefined) {
    throw new AddError(`"${feature}" takes no mode, but "${mode}" was given.`);
  }

  if (feature === 'queue' && !before.redis) {
    throw new AddError(
      'The queue requires Redis (BullMQ stores its jobs there), and this project does not have it. ' +
        'Run `ironveil add redis` first, then `ironveil add queue`.',
    );
  }

  if (feature === 'auth') {
    return {
      feature,
      value: 'jwt',
      after: resolveConfig({ ...before, auth: 'jwt' }),
      alreadyEnabled: before.auth === 'jwt',
    };
  }

  return {
    feature,
    value: true,
    after: resolveConfig({ ...before, [feature]: true }),
    alreadyEnabled: before[feature],
  };
}

