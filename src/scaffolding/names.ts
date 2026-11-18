import { GenerateError } from './generate-error.js';

export interface ResourceNames {
  /** The name exactly as the user typed it. */
  readonly input: string;
  /** `blog-post`: DTO file names. */
  readonly kebab: string;
  /** `BlogPost`: the Prisma model and DTO class names. */
  readonly pascal: string;
  /** `blogPost`: the Prisma client delegate (`prisma.blogPost`). */
  readonly camel: string;
  /** `blog-posts`: the module folder, file names and route. */
  readonly pluralKebab: string;
  /** `BlogPosts`: module, controller and service class names. */
  readonly pluralPascal: string;
  readonly pluralCamel: string;
  /** `blog_posts`: migration folder name. */
  readonly pluralSnake: string;
}

// Names the generated code or Prisma already uses, or that would shadow a
// JavaScript global inside the generated files.
const RESERVED_NAMES = new Set([
  'prisma',
  'prismaclient',
  'prismaservice',
  'paginated',
  'object',
  'array',
  'date',
  'error',
  'map',
  'set',
  'promise',
  'function',
  'symbol',
  'string',
  'number',
  'boolean',
  'json',
  'math',
  'request',
  'response',
]);

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*$/;

const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  person: 'people',
  child: 'children',
  man: 'men',
  woman: 'women',
  mouse: 'mice',
  foot: 'feet',
  tooth: 'teeth',
  goose: 'geese',
};

const UNCOUNTABLE = new Set([
  'news',
  'series',
  'species',
  'sheep',
  'fish',
  'equipment',
  'information',
]);

/** English plural of a single lowercase word; covers the common cases. */
export function pluralize(word: string): string {
  if (UNCOUNTABLE.has(word)) {
    return word;
  }

  const irregular = IRREGULAR_PLURALS[word];
  if (irregular !== undefined) {
    return irregular;
  }

  if (/[^aeiou]y$/.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }

  // quiz -> quizzes: a single z after a vowel doubles.
  if (/[aeiou]z$/.test(word)) {
    return `${word}zes`;
  }

  if (/(?:s|x|z|ch|sh)$/.test(word)) {
    return `${word}es`;
  }

  return `${word}s`;
}

export function deriveResourceNames(input: string): ResourceNames {
  const trimmed = input.trim();

  if (!NAME_PATTERN.test(trimmed)) {
    throw new GenerateError(
      `Invalid resource name "${input}". Use letters and digits, starting with a letter, ` +
        'optionally joined by - or _ (for example "product" or "blog-post").',
    );
  }

  const words = splitWords(trimmed);
  const pluralWords = [
    ...words.slice(0, -1),
    pluralize(words[words.length - 1] as string),
  ];

  const names: ResourceNames = {
    input,
    kebab: words.join('-'),
    pascal: words.map(capitalize).join(''),
    camel: toCamel(words),
    pluralKebab: pluralWords.join('-'),
    pluralPascal: pluralWords.map(capitalize).join(''),
    pluralCamel: toCamel(pluralWords),
    pluralSnake: pluralWords.join('_'),
  };

  if (RESERVED_NAMES.has(words.join(''))) {
    throw new GenerateError(
      `"${input}" is a reserved name: it would clash with a name the generated code or Prisma already uses. Pick another name.`,
    );
  }

  return names;
}

// "BlogPost", "blog_post", "blog-post" and "APIKey" all split into lowercase
// words; acronyms stay together ("APIKey" -> api, key).
function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function toCamel(words: readonly string[]): string {
  return words
    .map((word, index) => (index === 0 ? word : capitalize(word)))
    .join('');
}
