import { describe, expect, it } from 'vitest';
import {
  getTemplatesDirectory,
} from '../../src/rendering/template-path.js';

describe('getTemplatesDirectory', () => {
  it('resolves the templates directory', () => {
    const templatesDirectory =
      getTemplatesDirectory();

    expect(templatesDirectory).toMatch(
      /src[\\/]templates$/,
    );
  });
});