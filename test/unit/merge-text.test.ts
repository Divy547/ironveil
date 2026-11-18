import { describe, expect, it } from 'vitest';
import { mergeText } from '../../src/adding/index.js';

const lines = (...items: string[]): string => `${items.join('\n')}\n`;

describe('mergeText', () => {
  const base = lines('a', 'b', 'c', 'd', 'e', 'f');

  it('keeps edits made on both sides when they do not overlap', () => {
    const ours = lines('a', 'MINE', 'c', 'd', 'e', 'f');
    const theirs = lines('a', 'b', 'c', 'd', 'THEIRS', 'f');

    expect(mergeText(ours, base, theirs)).toEqual({
      merged: true,
      text: lines('a', 'MINE', 'c', 'd', 'THEIRS', 'f'),
    });
  });

  it('takes their change when ours is unchanged, and keeps ours when theirs is', () => {
    const theirs = lines('a', 'b', 'NEW', 'c', 'd', 'e', 'f');

    expect(mergeText(base, base, theirs)).toEqual({ merged: true, text: theirs });
    expect(mergeText(theirs, base, base)).toEqual({ merged: true, text: theirs });
  });

  it('is not a conflict when both sides made the same change', () => {
    const same = lines('a', 'SAME', 'c', 'd', 'e', 'f');

    expect(mergeText(same, base, same)).toEqual({ merged: true, text: same });
  });

  it('reports a conflict when both sides changed the same lines differently', () => {
    const ours = lines('a', 'MINE', 'c', 'd', 'e', 'f');
    const theirs = lines('a', 'THEIRS', 'c', 'd', 'e', 'f');

    expect(mergeText(ours, base, theirs)).toEqual({ merged: false, conflicts: 1 });
  });

  it('counts every conflicting region', () => {
    const ours = lines('X', 'b', 'c', 'd', 'e', 'Y');
    const theirs = lines('P', 'b', 'c', 'd', 'e', 'Q');

    expect(mergeText(ours, base, theirs)).toEqual({ merged: false, conflicts: 2 });
  });

  it('merges inserts at different places', () => {
    const ours = lines('top', 'a', 'b', 'c', 'd', 'e', 'f');
    const theirs = lines('a', 'b', 'c', 'd', 'e', 'f', 'bottom');

    expect(mergeText(ours, base, theirs)).toEqual({
      merged: true,
      text: lines('top', 'a', 'b', 'c', 'd', 'e', 'f', 'bottom'),
    });
  });

  it('keeps CRLF when our file uses it, and treats the line endings as no change', () => {
    const ours = base.replace(/\n/g, '\r\n').replace('b\r\n', 'MINE\r\n');
    const theirs = lines('a', 'b', 'c', 'd', 'THEIRS', 'f');

    const result = mergeText(ours, base, theirs);

    expect(result).toEqual({
      merged: true,
      text: ['a', 'MINE', 'c', 'd', 'THEIRS', 'f', ''].join('\r\n'),
    });
  });

  it('keeps a missing final newline', () => {
    const ours = 'a\nb\nc';
    const result = mergeText(ours, 'a\nb\nc', 'a\nb\nc\nd');

    expect(result).toEqual({ merged: true, text: 'a\nb\nc\nd' });
  });
});
