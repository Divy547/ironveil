import { describe, expect, it } from 'vitest';
import { mergePackageJson } from '../../src/adding/index.js';

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const base = {
  name: 'shop-api',
  version: '0.0.1',
  scripts: { build: 'nest build', start: 'nest start' },
  dependencies: { '@nestjs/core': '11.0.0', zod: '4.0.0' },
  devDependencies: { typescript: '5.0.0' },
};

const theirs = {
  ...base,
  scripts: {
    build: 'nest build',
    test: 'jest',
    start: 'nest start',
    'test:e2e': 'jest --config ./test/jest-e2e.json',
  },
  devDependencies: { typescript: '5.0.0', jest: '30.0.0' },
};

const parse = (text: string) => JSON.parse(text) as typeof base;

describe('mergePackageJson', () => {
  it('takes the target verbatim when ours is unchanged, key order included', () => {
    const result = mergePackageJson(json(base), json(base), json(theirs));

    expect(result).toEqual({ merged: true, text: json(theirs) });
  });

  it('adds the new entries to a file the user has edited, keeping their edits', () => {
    const ours = {
      ...base,
      scripts: { ...base.scripts, lint: 'eslint .' },
      dependencies: { ...base.dependencies, dayjs: '1.11.0' },
    };

    const result = mergePackageJson(json(ours), json(base), json(theirs));

    expect(result.merged).toBe(true);
    if (!result.merged) return;
    const merged = parse(result.text);
    expect(merged.scripts).toEqual({
      build: 'nest build',
      test: 'jest',
      start: 'nest start',
      'test:e2e': 'jest --config ./test/jest-e2e.json',
      lint: 'eslint .',
    });
    expect(merged.dependencies).toEqual({ ...base.dependencies, dayjs: '1.11.0' });
    expect(merged.devDependencies).toEqual({ typescript: '5.0.0', jest: '30.0.0' });
  });

  it('places a new entry after the entry that precedes it in the target', () => {
    const ours = { ...base, scripts: { build: 'nest build', start: 'nest start', mine: 'x' } };

    const result = mergePackageJson(json(ours), json(base), json(theirs));

    expect(result.merged).toBe(true);
    if (!result.merged) return;
    expect(Object.keys(parse(result.text).scripts)).toEqual([
      'build',
      'test',
      'start',
      'test:e2e',
      'mine',
    ]);
  });

  it('is a no-op when the user already added exactly what the target adds', () => {
    const result = mergePackageJson(json(theirs), json(base), json(theirs));

    expect(result).toEqual({ merged: true, text: json(theirs) });
  });

  it('keeps a user-changed value that the target left alone', () => {
    const ours = { ...base, version: '2.0.0', dependencies: { ...base.dependencies, zod: '4.5.0' } };

    const result = mergePackageJson(json(ours), json(base), json(theirs));

    expect(result.merged).toBe(true);
    if (!result.merged) return;
    expect(parse(result.text).version).toBe('2.0.0');
    expect(parse(result.text).dependencies.zod).toBe('4.5.0');
  });

  it('reports the key when the user changed a value the target also changes', () => {
    const ours = { ...base, scripts: { ...base.scripts, build: 'tsc' } };
    const target = { ...base, scripts: { ...base.scripts, build: 'swc' } };

    const result = mergePackageJson(json(ours), json(base), json(target));

    expect(result).toEqual({ merged: false, conflicts: ['scripts.build'] });
  });

  it('reports a script the user already defined differently from the one being added', () => {
    const ours = { ...base, scripts: { ...base.scripts, test: 'vitest' } };

    const result = mergePackageJson(json(ours), json(base), json(theirs));

    expect(result).toEqual({ merged: false, conflicts: ['scripts.test'] });
  });

  it('merges a changed top-level value only when ours still has the base value', () => {
    const target = { ...base, license: 'MIT' };

    expect(mergePackageJson(json(base), json(base), json(target)).merged).toBe(true);
    expect(
      mergePackageJson(json({ ...base, license: 'ISC' }), json(base), json(target)),
    ).toEqual({ merged: false, conflicts: ['license'] });
  });

  it('reports a package.json that is not valid JSON instead of throwing', () => {
    const result = mergePackageJson('{ nope', json(base), json(theirs));

    expect(result.merged).toBe(false);
  });
});
