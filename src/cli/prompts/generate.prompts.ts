import * as p from '@clack/prompts';
import {
  FIELD_TYPES,
  GenerateError,
  parseFields,
  type FieldSpec,
} from '../../scaffolding/index.js';

const describeField = (field: FieldSpec): string =>
  `${field.name}:${field.type}${field.optional ? '?' : ''}`;

/**
 * Asks for the resource's fields one at a time (`price:decimal?`) until an
 * empty answer. Each answer is validated as it is typed, including against
 * the fields already entered.
 */
export async function promptFields(): Promise<FieldSpec[]> {
  const fields: FieldSpec[] = [];

  for (;;) {
    const answer = await p.text({
      message:
        fields.length === 0
          ? `Add a field as name:type (types: ${Object.keys(FIELD_TYPES).join(', ')}; add ? after the type for optional). Press Enter to finish`
          : 'Add another field (press Enter to finish)',
      placeholder: 'price:decimal?',
      validate: (value) => validateAnswer(value ?? '', fields),
    });

    if (p.isCancel(answer)) {
      p.cancel('Operation cancelled.');
      process.exit(130);
    }

    const trimmed = answer.trim();
    if (trimmed === '') {
      return fields;
    }

    fields.push(...parseFields(trimmed));
  }
}

function validateAnswer(
  value: string,
  existing: readonly FieldSpec[],
): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  if (trimmed.split(/[\s,]+/).length > 1) {
    return 'Enter one field at a time.';
  }

  try {
    parseFields([...existing.map(describeField), trimmed]);
    return undefined;
  } catch (error) {
    if (error instanceof GenerateError) {
      return error.message;
    }
    throw error;
  }
}
