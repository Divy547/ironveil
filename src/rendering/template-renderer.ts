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

      const swaggerImport =
        config.swagger
          ? "import { setupSwagger } from './infrastructure/swagger/swagger.setup';"
          : '';

      const swaggerSetup =
        config.swagger
          ? 'setupSwagger(app);'
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
        )
        .replace(
          /\{\{\s*swaggerImport\s*\}\}/g,
          swaggerImport,
        )
        .replace(
          /\{\{\s*swaggerSetup\s*\}\}/g,
          swaggerSetup,
        );
    },
  };
}