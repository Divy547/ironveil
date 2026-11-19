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

  describe('email', () => {
    const isMailPrompt = (o: PromptOptions) => /email|mail/i.test(o.message);

    function answer(mail: boolean): void {
      select.mockImplementation((o: PromptOptions) => Promise.resolve(o.initialValue));
      confirm.mockImplementation((o: PromptOptions) =>
        Promise.resolve(isMailPrompt(o) ? mail : o.initialValue),
      );
    }

    it('asks about email, defaulting to no, whether or not Redis is enabled', async () => {
      answer(false);

      const result = await promptCreateOptions();

      const prompt = confirm.mock.calls
        .map((call) => call[0] as PromptOptions)
        .find(isMailPrompt);
      expect(prompt).toBeDefined();
      expect(prompt?.initialValue).toBe(false);
      expect(result.mail).toBe(false);
    });

    it('returns the email choice the user made', async () => {
      answer(true);

      expect((await promptCreateOptions()).mail).toBe(true);
    });

    it('exits when the email prompt is cancelled', async () => {
      confirm.mockImplementation((o: PromptOptions) =>
        Promise.resolve(isMailPrompt(o) ? Symbol.for('cancel') : o.initialValue),
      );
      select.mockImplementation((o: PromptOptions) => Promise.resolve(o.initialValue));
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as never);

      await expect(promptCreateOptions()).rejects.toThrow('exit');
      expect(exit).toHaveBeenCalledWith(130);

      exit.mockRestore();
    });
  });

  describe('OpenTelemetry', () => {
    const isOtelPrompt = (o: PromptOptions) => /opentelemetry|tracing/i.test(o.message);

    function answer(otel: boolean): void {
      select.mockImplementation((o: PromptOptions) => Promise.resolve(o.initialValue));
      confirm.mockImplementation((o: PromptOptions) =>
        Promise.resolve(isOtelPrompt(o) ? otel : o.initialValue),
      );
    }

    it('asks about tracing, defaulting to no, whether or not Redis is enabled', async () => {
      answer(false);

      const result = await promptCreateOptions();

      const prompt = confirm.mock.calls
        .map((call) => call[0] as PromptOptions)
        .find(isOtelPrompt);
      expect(prompt).toBeDefined();
      expect(prompt?.initialValue).toBe(false);
      expect(result.otel).toBe(false);
    });

    it('returns the tracing choice the user made', async () => {
      answer(true);

      expect((await promptCreateOptions()).otel).toBe(true);
    });

    it('does not mistake the tracing question for the email, queue or Redis ones', () => {
      const message = 'Enable OpenTelemetry tracing?';

      expect(/email|mail/i.test(message)).toBe(false);
      expect(/queue/i.test(message)).toBe(false);
      expect(/redis/i.test(message)).toBe(false);
    });

    it('exits when the tracing prompt is cancelled', async () => {
      confirm.mockImplementation((o: PromptOptions) =>
        Promise.resolve(isOtelPrompt(o) ? Symbol.for('cancel') : o.initialValue),
      );
      select.mockImplementation((o: PromptOptions) => Promise.resolve(o.initialValue));
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as never);

      await expect(promptCreateOptions()).rejects.toThrow('exit');
      expect(exit).toHaveBeenCalledWith(130);

      exit.mockRestore();
    });
  });

  describe('job queue', () => {
    const isQueuePrompt = (o: PromptOptions) => /queue/i.test(o.message);
    const isRedisPrompt = (o: PromptOptions) => /redis/i.test(o.message) && !isQueuePrompt(o);

    function answer(redis: boolean, queue: boolean): void {
      select.mockImplementation((o: PromptOptions) => Promise.resolve(o.initialValue));
      confirm.mockImplementation((o: PromptOptions) => {
        if (isRedisPrompt(o)) return Promise.resolve(redis);
        if (isQueuePrompt(o)) return Promise.resolve(queue);
        return Promise.resolve(o.initialValue);
      });
    }

    it('asks about the queue, defaulting to no, when Redis is enabled', async () => {
      answer(true, false);

      const result = await promptCreateOptions();

      const prompt = confirm.mock.calls
        .map((call) => call[0] as PromptOptions)
        .find(isQueuePrompt);
      expect(prompt).toBeDefined();
      expect(prompt?.initialValue).toBe(false);
      expect(result.queue).toBe(false);
    });

    it('returns the queue choice the user made', async () => {
      answer(true, true);

      expect((await promptCreateOptions()).queue).toBe(true);
    });

    it('does not ask about the queue, and turns it off, when Redis is not enabled', async () => {
      answer(false, true);

      const result = await promptCreateOptions();

      expect(confirm.mock.calls.map((call) => call[0] as PromptOptions).some(isQueuePrompt)).toBe(false);
      expect(result.queue).toBe(false);
    });

    it('exits when the queue prompt is cancelled', async () => {
      answer(true, false);
      confirm.mockImplementation((o: PromptOptions) => {
        if (isRedisPrompt(o)) return Promise.resolve(true);
        if (isQueuePrompt(o)) return Promise.resolve(Symbol.for('cancel'));
        return Promise.resolve(o.initialValue);
      });
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as never);

      await expect(promptCreateOptions()).rejects.toThrow('exit');
      expect(exit).toHaveBeenCalledWith(130);

      exit.mockRestore();
    });
  });
});
