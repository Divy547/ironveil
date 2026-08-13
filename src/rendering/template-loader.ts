import path from 'node:path';
import type { FileSystem } from '../utils/filesystem.js';

export interface TemplateLoader {
  load(relativePath: string): Promise<string>;
}

export function createTemplateLoader(
  templatesDirectory: string,
  fs: FileSystem,
): TemplateLoader {
  return {
    async load(relativePath: string): Promise<string> {
      const templatePath = path.join(
        templatesDirectory,
        relativePath,
      );

      return fs.readFile(templatePath);
    },
  };
}