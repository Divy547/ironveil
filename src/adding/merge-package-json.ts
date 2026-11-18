export type PackageJsonMerge =
  | { readonly merged: true; readonly text: string }
  | { readonly merged: false; readonly conflicts: readonly string[] };

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
    );
  }
  return false;
}

/**
 * Sets `key`. An existing key keeps its place; a new one goes right after the
 * key that precedes it in `order` (the target's key order) when we have that
 * key, else right before the one that follows it, else at the end. That keeps
 * a merged file close to what `create` would have written.
 */
function setOrdered(
  object: JsonObject,
  key: string,
  value: unknown,
  order: readonly string[],
): JsonObject {
  if (Object.hasOwn(object, key)) {
    return { ...object, [key]: value };
  }

  const keys = Object.keys(object);
  const position = order.indexOf(key);
  let at = keys.length;

  const before = order
    .slice(0, Math.max(position, 0))
    .reverse()
    .map((name) => keys.indexOf(name))
    .find((index) => index >= 0);

  if (before !== undefined) {
    at = before + 1;
  } else {
    const after = order
      .slice(position + 1)
      .map((name) => keys.indexOf(name))
      .find((index) => index >= 0);
    if (after !== undefined) at = after;
  }

  const entries = Object.entries(object);
  entries.splice(at, 0, [key, value]);

  return Object.fromEntries(entries);
}

function remove(object: JsonObject, key: string): JsonObject {
  return Object.fromEntries(
    Object.entries(object).filter(([name]) => name !== key),
  );
}

/**
 * Merges the changes between `base` and `theirs` into `ours`, as JSON: a
 * line-based merge would trip over neighbouring dependencies and says nothing
 * useful when it fails. Works per entry of `scripts`, `dependencies`,
 * `devDependencies` (and any other object section), and per value for the
 * rest. A conflict is reported as its key path, e.g. `scripts.test`.
 */
export function mergePackageJson(
  ours: string,
  base: string,
  theirs: string,
): PackageJsonMerge {
  let o: unknown;
  let b: unknown;
  let t: unknown;
  try {
    o = JSON.parse(ours);
    b = JSON.parse(base);
    t = JSON.parse(theirs);
  } catch {
    return { merged: false, conflicts: ['package.json is not valid JSON'] };
  }

  if (!isObject(o) || !isObject(b) || !isObject(t)) {
    return { merged: false, conflicts: ['package.json is not a JSON object'] };
  }

  if (deepEqual(o, b)) return { merged: true, text: theirs };
  if (deepEqual(o, t)) return { merged: true, text: ours };

  const conflicts: string[] = [];
  const topOrder = Object.keys(t);
  let result: JsonObject = o;

  const keys = new Set([...Object.keys(b), ...Object.keys(t)]);
  for (const key of keys) {
    const baseValue = b[key];
    const theirValue = t[key];
    const ourValue = result[key];

    if (deepEqual(baseValue, theirValue)) continue;

    const sectional =
      (isObject(baseValue) || isObject(theirValue)) &&
      (baseValue === undefined || isObject(baseValue)) &&
      (theirValue === undefined || isObject(theirValue)) &&
      (ourValue === undefined || isObject(ourValue));

    if (sectional) {
      const merged = mergeSection(
        key,
        (baseValue as JsonObject | undefined) ?? {},
        (theirValue as JsonObject | undefined) ?? {},
        (ourValue as JsonObject | undefined) ?? {},
        conflicts,
      );
      if (theirValue === undefined && Object.keys(merged).length === 0) {
        result = remove(result, key);
      } else {
        result = setOrdered(result, key, merged, topOrder);
      }
      continue;
    }

    if (deepEqual(ourValue, theirValue)) continue;

    if (deepEqual(ourValue, baseValue)) {
      result =
        theirValue === undefined
          ? remove(result, key)
          : setOrdered(result, key, theirValue, topOrder);
    } else {
      conflicts.push(key);
    }
  }

  return conflicts.length > 0
    ? { merged: false, conflicts }
    : { merged: true, text: `${JSON.stringify(result, null, 2)}\n` };
}

function mergeSection(
  section: string,
  base: JsonObject,
  theirs: JsonObject,
  ours: JsonObject,
  conflicts: string[],
): JsonObject {
  const order = Object.keys(theirs);
  let result = ours;

  for (const entry of new Set([...Object.keys(base), ...order])) {
    const baseValue = base[entry];
    const theirValue = theirs[entry];
    const ourValue = result[entry];

    if (deepEqual(baseValue, theirValue)) continue;
    if (deepEqual(ourValue, theirValue)) continue;

    // The user changed or removed what the feature also changes.
    const untouched = deepEqual(ourValue, baseValue);

    if (!untouched) {
      conflicts.push(`${section}.${entry}`);
    } else if (theirValue === undefined) {
      result = remove(result, entry);
    } else {
      result = setOrdered(result, entry, theirValue, order);
    }
  }

  return result;
}
