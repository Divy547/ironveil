import { beforeEach, describe, expect, it, vi } from 'vitest';

const text = vi.fn();
const cancel = vi.fn();

vi.mock('@clack/prompts', () => ({
  text: (options: unknown) => text(options),
  cancel: (message: unknown) => cancel(message),
  isCancel: (value: unknown) => value === Symbol.for('cancel'),
}));

import { promptFields } from '../../src/cli/prompts/generate.prompts.js';

interface TextOptions {
  readonly message: string;
  readonly validate?: (value: string) => string | undefined;
}

function answers(...values: unknown[]): void {
  values.forEach((value) => text.mockResolvedValueOnce(value));
}

describe('promptFields', () => {
  beforeEach(() => {
    text.mockReset();
    cancel.mockReset();
  });

  it('collects fields until an empty answer', async () => {
    answers('name:string', 'price:decimal?', '');

    const fields = await promptFields();

    expect(fields).toEqual([
      { name: 'name', type: 'string', optional: false },
      { name: 'price', type: 'decimal', optional: true },
    ]);
    expect(text).toHaveBeenCalledTimes(3);
  });

  it('returns no fields when the first answer is empty', async () => {
    answers('');

    expect(await promptFields()).toEqual([]);
  });

  it('treats whitespace as an empty answer', async () => {
    answers('   ');

    expect(await promptFields()).toEqual([]);
  });

  it('tells the user the format and the available types', async () => {
    answers('');

    await promptFields();

    const options = text.mock.calls[0]?.[0] as TextOptions;
    expect(options.message).toMatch(/name:type/);
    expect(options.message).toMatch(/string.*decimal.*datetime/s);
  });

  it('validates each answer, rejecting bad types, bad names and duplicates', async () => {
    answers('name:string', '');

    await promptFields();

    const first = text.mock.calls[0]?.[0] as TextOptions;
    const second = text.mock.calls[1]?.[0] as TextOptions;

    expect(first.validate?.('')).toBeUndefined();
    expect(first.validate?.('price:decimal?')).toBeUndefined();
    expect(first.validate?.('price:money')).toMatch(/money/);
    expect(first.validate?.('Price:int')).toMatch(/Price/);
    expect(first.validate?.('price')).toMatch(/price/);
    expect(first.validate?.('a:int b:int')).toMatch(/one field/i);
    // The second prompt knows "name" is taken.
    expect(second.validate?.('name:int')).toMatch(/duplicate.*name/i);
  });

  it('exits with 130 when cancelled', async () => {
    answers(Symbol.for('cancel'));
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {
        throw new Error('exit');
      }) as never);

    await expect(promptFields()).rejects.toThrow('exit');

    expect(cancel).toHaveBeenCalledWith('Operation cancelled.');
    expect(exit).toHaveBeenCalledWith(130);
    exit.mockRestore();
  });
});
