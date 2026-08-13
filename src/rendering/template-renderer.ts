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
      const authModuleImport =
        config.auth === 'jwt'
          ? "import { AuthModule } from './modules/auth/auth.module';"
          : '';

      const authModule =
        config.auth === 'jwt'
          ? 'AuthModule,'
          : '';

      return template
        .replace(
          /\{\{\s*projectName\s*\}\}/g,
          config.projectName,
        )
        .replace(
          /\{\{\s*authModuleImport\s*\}\}/g,
          authModuleImport,
        )
        .replace(
          /\{\{\s*authModule\s*\}\}/g,
          authModule,
        );
    },
  };
}