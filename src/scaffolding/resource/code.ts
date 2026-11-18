/** Helpers shared by the resource file builders. */

/** Joins lines into file content that ends with exactly one newline. */
export function file(lines: readonly string[]): string {
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * `import { A, B } from 'x';`, wrapped one name per line when it would pass
 * 80 columns (the generated Prettier config's print width).
 */
export function namedImport(
  names: readonly string[],
  from: string,
  options: { readonly type?: boolean } = {},
): string {
  const sorted = [...names].sort();
  const keyword = options.type === true ? 'import type' : 'import';
  const oneLine = `${keyword} { ${sorted.join(', ')} } from '${from}';`;

  if (oneLine.length <= 80) {
    return oneLine;
  }

  return [
    `${keyword} {`,
    ...sorted.map((name) => `  ${name},`),
    `} from '${from}';`,
  ].join('\n');
}

export function indent(lines: readonly string[], spaces = 2): string[] {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => (line === '' ? line : `${prefix}${line}`));
}
