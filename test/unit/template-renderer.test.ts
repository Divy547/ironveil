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

  it('renders auth module placeholders when JWT is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      auth: 'jwt',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{authModuleImport}}',
        '@Module({',
        '  imports: [{{authModule}}]',
        '})',
      ].join('\n'),
      config,
    );

    expect(result).toContain(
      "import { AuthModule } from './modules/auth/auth.module';",
    );

    expect(result).toContain(
      'imports: [AuthModule,]',
    );
  });

  it('removes auth module placeholders when JWT is disabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{authModuleImport}}',
        '@Module({',
        '  imports: [{{authModule}}]',
        '})',
      ].join('\n'),
      config,
    );

    expect(result).not.toContain(
      'AuthModule',
    );
  });

  it('renders swagger placeholders when swagger is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: true,
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{swaggerImport}}',
        'async function bootstrap() {',
        '  {{swaggerSetup}}',
        '}',
      ].join('\n'),
      config,
    );

    expect(result).toContain(
      "import { setupSwagger } from './infrastructure/swagger/swagger.setup';",
    );

    expect(result).toContain(
      'setupSwagger(app);',
    );
  });

  it('removes swagger placeholders when swagger is disabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: false,
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{swaggerImport}}',
        'async function bootstrap() {',
        '  {{swaggerSetup}}',
        '}',
      ].join('\n'),
      config,
    );

    expect(result).not.toContain(
      'setupSwagger',
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