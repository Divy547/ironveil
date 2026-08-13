import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  createGenerationContext,
} from '../../src/generators/core/generation-context.js';
import {
  createTemplateLoader,
} from '../../src/rendering/template-loader.js';
import {
  createTemplateRenderer,
} from '../../src/rendering/template-renderer.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('GenerationContext', () => {
  it('creates a generation context', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const fs = createFileSystem();

    const loader = createTemplateLoader(
      '/tmp/templates',
      fs,
    );

    const renderer = createTemplateRenderer();

    const context = createGenerationContext(
      config,
      '/tmp/test-api',
      fs,
      loader,
      renderer,
    );

    expect(context.config).toBe(config);
    expect(context.destination).toBe(
      '/tmp/test-api',
    );
    expect(context.fs).toBe(fs);
    expect(context.loader).toBe(loader);
    expect(context.renderer).toBe(renderer);
  });

  it('freezes the context', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const context = createGenerationContext(
      config,
      '/tmp/test-api',
      createFileSystem(),
      createTemplateLoader(
        '/tmp/templates',
        createFileSystem(),
      ),
      createTemplateRenderer(),
    );

    expect(Object.isFrozen(context)).toBe(true);
  });
});