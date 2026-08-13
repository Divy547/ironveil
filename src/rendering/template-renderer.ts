import type { ForgeKitConfig } from '../config/index.js';

export interface TemplateRenderer {
  render(
    template: string,
    config: ForgeKitConfig,
  ): string;
}

export function createTemplateRenderer(): TemplateRenderer {
  return {
    render(template, config): string {
      return template.replace(
        /\{\{\s*projectName\s*\}\}/g,
        config.projectName,
      );
    },
  };
}