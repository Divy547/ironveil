import { EditError } from './edit-error.js';

/**
 * Text-level edits for `prisma/schema.prisma`. Like the TypeScript editor,
 * these take the file's text and return the new text, are idempotent, and
 * leave everything they do not touch exactly as it was.
 */

type DefinitionKind = 'model' | 'enum';

const DEFINITION_HEAD = /^(model|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/;

export function appendPrismaModel(schema: string, definition: string): string {
  return appendDefinition(schema, 'model', definition);
}

export function appendPrismaEnum(schema: string, definition: string): string {
  return appendDefinition(schema, 'enum', definition);
}

/** True when the schema already declares a model or an enum called `name`. */
export function hasPrismaDefinition(schema: string, name: string): boolean {
  return findDefinitionKind(schema, name) !== undefined;
}

function appendDefinition(
  schema: string,
  kind: DefinitionKind,
  definition: string,
): string {
  const text = definition.trim().replace(/\r\n/g, '\n');
  const { name } = parseDefinition(kind, text);
  const existing = findDefinitionKind(schema, name);

  if (existing === kind) {
    return schema;
  }

  if (existing !== undefined) {
    throw new EditError(
      `Cannot add ${kind} "${name}": the schema already has a ${existing} with that name.`,
    );
  }

  const newline = schema.includes('\r\n') ? '\r\n' : '\n';
  const block = text.replace(/\n/g, newline);
  const body = schema.trimEnd();

  return body === ''
    ? `${block}${newline}`
    : `${body}${newline}${newline}${block}${newline}`;
}

function parseDefinition(
  kind: DefinitionKind,
  text: string,
): { readonly name: string } {
  const head = DEFINITION_HEAD.exec(text);

  if (head === null) {
    throw new EditError(
      `Expected a Prisma ${kind} definition (\`${kind} Name { ... }\`), got: ${preview(text)}`,
    );
  }

  if (head[1] !== kind) {
    throw new EditError(
      `Expected a Prisma ${kind} definition, but the text defines a ${head[1]}.`,
    );
  }

  const end = findBlockEnd(text);

  if (end === undefined) {
    throw new EditError(
      `The ${kind} "${head[2]}" has unbalanced braces, so it cannot be added.`,
    );
  }

  if (text.slice(end + 1).trim() !== '') {
    throw new EditError(
      `Expected exactly one ${kind} block, but there is more text after the closing brace.`,
    );
  }

  return { name: head[2]! };
}

/** Index of the brace that closes the first block, ignoring braces in strings. */
function findBlockEnd(text: string): number | undefined {
  let depth = 0;
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (inString) {
      if (char === '\\') {
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

function findDefinitionKind(
  schema: string,
  name: string,
): DefinitionKind | undefined {
  for (const line of schema.split(/\r?\n/)) {
    const head = DEFINITION_HEAD.exec(line.trimStart());

    if (head !== null && head[2] === name) {
      return head[1] as DefinitionKind;
    }
  }

  return undefined;
}

function preview(text: string): string {
  const firstLine = text.split('\n')[0] ?? '';

  return JSON.stringify(
    firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine,
  );
}
