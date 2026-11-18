import {
  RESOURCE_AUTH_POLICIES,
  type ResourceAuthPolicy,
} from '../manifest/index.js';
import { GenerateError } from './generate-error.js';

export { RESOURCE_AUTH_POLICIES, type ResourceAuthPolicy };

export const DEFAULT_AUTH_POLICY: ResourceAuthPolicy = 'user';

export function parseAuthPolicy(value: string): ResourceAuthPolicy {
  const policy = RESOURCE_AUTH_POLICIES.find((candidate) => candidate === value);
  if (policy === undefined) {
    throw new GenerateError(
      `Unknown --auth policy "${value}". Use one of: ${RESOURCE_AUTH_POLICIES.join(', ')}.`,
    );
  }
  return policy;
}

export type RouteAccess = 'token' | 'public' | 'admin';

export type RouteKind = 'read' | 'write';

/** Who may call a read (GET) or write (POST, PATCH, DELETE) route. */
export function routeAccess(
  policy: ResourceAuthPolicy,
  kind: RouteKind,
): RouteAccess {
  switch (policy) {
    case 'user':
      return 'token';
    case 'admin':
      return 'admin';
    case 'admin-writes':
      return kind === 'write' ? 'admin' : 'token';
    case 'public-read':
      return kind === 'write' ? 'admin' : 'public';
  }
}
