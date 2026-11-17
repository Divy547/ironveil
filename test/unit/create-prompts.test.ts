import { beforeEach, describe, expect, it, vi } from 'vitest';

const select = vi.fn();
const confirm = vi.fn();
const cancel = vi.fn();

vi.mock('@clack/prompts', () => ({
  select: (options: unknown) => select(options),
  confirm: (options: unknown) => confirm(options),
  cancel: (message: unknown) => cancel(message),
  isCancel: (value: unknown) => value === Symbol.for('cancel'),
}));

import { promptCreateOptions } from '../../src/cli/prompts/create.prompts.js';

interface PromptOptions {
  readonly message: string;
  readonly initialValue?: unknown;
  readonly options?: readonly { value: unknown }[];
}

function answerWithInitialValues(): void {
  select.mockImplementation((o: PromptOptions) =>
    Promise.resolve(o.initialValue),
  );
  confirm.mockImplementation((o: PromptOptions) =>
    Promise.resolve(o.initialValue),
  );
}

describe('promptCreateOptions', () => {
  beforeEach(() => {
    select.mockReset();
    confirm.mockReset();
    cancel.mockReset();
  });

  it('asks which AI agent files to generate, defaulting to agents', async () => {
    answerWithInitialValues();

    const result = await promptCreateOptions();

    const aiPrompt = select.mock.calls
      .map((call) => call[0] as PromptOptions)
      .find((o) => /ai/i.test(o.message));

    expect(aiPrompt).toBeDefined();
    expect(aiPrompt?.initialValue).toBe('agents');
    expect(aiPrompt?.options?.map((o) => o.value)).toEqual([
      'none',
      'agents',
      'all',
    ]);
    expect(result.ai).toBe('agents');
  });

  it('returns the AI choice the user picked', async () => {
    answerWithInitialValues();
    select.mockImplementation((o: PromptOptions) =>
      Promise.resolve(/ai/i.test(o.message) ? 'all' : o.initialValue),
    );

    const result = await promptCreateOptions();

    expect(result.ai).toBe('all');
  });

  it('exits when the AI prompt is cancelled', async () => {
    answerWithInitialValues();
    select.mockImplementation((o: PromptOptions) =>
      Promise.resolve(
        /ai/i.test(o.message) ? Symbol.for('cancel') : o.initialValue,
      ),
    );
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {
        throw new Error('exit');
      }) as never);

    await expect(promptCreateOptions()).rejects.toThrow('exit');
    expect(cancel).toHaveBeenCalledWith('Operation cancelled.');
    expect(exit).toHaveBeenCalledWith(130);

    exit.mockRestore();
  });
});
