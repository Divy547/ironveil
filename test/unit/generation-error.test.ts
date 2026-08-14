import { describe, expect, it } from 'vitest';
import { GenerationError } from '../../src/generators/core/generation-error.js';

describe('GenerationError', () => {
  it('creates an error with message and default properties', () => {
    const error = new GenerationError('Generation failed');

    expect(error.name).toBe('GenerationError');
    expect(error.message).toBe('Generation failed');
    expect(error.projectName).toBeUndefined();
    expect(error.generatorName).toBeUndefined();
    expect(error.destination).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('attaches structured context options', () => {
    const originalError = new Error('Template not found');
    const error = new GenerationError('Generator failed', {
      projectName: 'my-app',
      generatorName: 'prisma',
      destination: '/tmp/my-app',
      cause: originalError,
    });

    expect(error.name).toBe('GenerationError');
    expect(error.message).toBe('Generator failed');
    expect(error.projectName).toBe('my-app');
    expect(error.generatorName).toBe('prisma');
    expect(error.destination).toBe('/tmp/my-app');
    expect(error.cause).toBe(originalError);
  });

  it('preserves non-Error cause values', () => {
    const error = new GenerationError('Failed with string', {
      cause: 'raw-failure-string',
    });

    expect(error.cause).toBe('raw-failure-string');
  });
});
