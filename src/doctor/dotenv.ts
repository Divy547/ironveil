/**
 * Reads the variable names and values of a `.env` file. Deliberately small:
 * it understands what `.env.example` and a hand-written `.env` contain
 * (comments, `export`, quotes, inline comments), not the full dotenv spec, and
 * it never expands `${VARIABLES}`.
 */
export function parseDotenv(text: string): Map<string, string> {
  const variables = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=(.*)$/.exec(line);
    if (match === null) continue;

    variables.set(match[1] as string, parseValue((match[2] as string).trim()));
  }

  return variables;
}

function parseValue(raw: string): string {
  const quote = raw[0];

  if ((quote === '"' || quote === "'") && raw.length >= 2 && raw.endsWith(quote)) {
    return raw.slice(1, -1);
  }

  // An unquoted value ends at " #": a # with no space before it is data.
  const comment = raw.search(/\s#/);

  return (comment === -1 ? raw : raw.slice(0, comment)).trim();
}
