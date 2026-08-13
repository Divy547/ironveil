import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  createTemplateRenderer,
} from '../../src/rendering/template-renderer.js';

describe('TemplateRenderer', () => {
  it('renders projectName placeholders', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      '# {{projectName}}\n',
      config,
    );

    expect(result).toBe('# test-api\n');
  });

  it('renders multiple projectName placeholders', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      '{{projectName}} - {{ projectName }}',
      config,
    );

    expect(result).toBe(
      'test-api - test-api',
    );
  });

  it('leaves unknown placeholders unchanged', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      '{{unknown}}',
      config,
    );

    expect(result).toBe('{{unknown}}');
  });
});