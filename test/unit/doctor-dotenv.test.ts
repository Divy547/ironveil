import { describe, expect, it } from 'vitest';
import { parseDotenv } from '../../src/doctor/dotenv.js';

describe('parseDotenv', () => {
  it('reads KEY=value lines', () => {
    const env = parseDotenv('PORT=3000\nNODE_ENV=development\n');

    expect(env.get('PORT')).toBe('3000');
    expect(env.get('NODE_ENV')).toBe('development');
  });

  it('ignores blank lines and comments', () => {
    const env = parseDotenv('# a comment\n\n   \nPORT=1\n  # indented comment\n');

    expect([...env.keys()]).toEqual(['PORT']);
  });

  it('strips matching single or double quotes', () => {
    const env = parseDotenv(`A="x y"\nB='z'\nC="unterminated\n`);

    expect(env.get('A')).toBe('x y');
    expect(env.get('B')).toBe('z');
    expect(env.get('C')).toBe('"unterminated');
  });

  it('keeps a # inside quotes but drops an inline comment after an unquoted value', () => {
    const env = parseDotenv('A="a # b"\nB=value # note\nC=no#space\n');

    expect(env.get('A')).toBe('a # b');
    expect(env.get('B')).toBe('value');
    expect(env.get('C')).toBe('no#space');
  });

  it('accepts an export prefix and CRLF line endings', () => {
    const env = parseDotenv('export A=1\r\nB=2\r\n');

    expect(env.get('A')).toBe('1');
    expect(env.get('B')).toBe('2');
  });

  it('records an empty value as an empty string, and keeps = inside values', () => {
    const env = parseDotenv('A=\nURL=postgresql://u:p@h/db?x=1\n');

    expect(env.get('A')).toBe('');
    expect(env.get('URL')).toBe('postgresql://u:p@h/db?x=1');
  });

  it('skips lines that are not assignments', () => {
    const env = parseDotenv('not an assignment\n=novalue\nOK=1\n');

    expect([...env.keys()]).toEqual(['OK']);
  });

  it('lets a later assignment win', () => {
    expect(parseDotenv('A=1\nA=2\n').get('A')).toBe('2');
  });
});
