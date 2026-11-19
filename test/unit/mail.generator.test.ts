import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { createGenerationContext } from '../../src/generators/core/generation-context.js';
import { MailGenerator } from '../../src/generators/features/mail/mail.generator.js';
import { createTemplateLoader } from '../../src/rendering/template-loader.js';
import { createTemplateRenderer } from '../../src/rendering/template-renderer.js';
import { getTemplatesDirectory } from '../../src/rendering/template-path.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

interface Helpers {
  toTransportOptions(config: MailConfig): Record<string, unknown>;
  toMailOptions(
    message: Record<string, unknown>,
    from: string,
  ): Record<string, unknown>;
}

const baseConfig: MailConfig = {
  host: 'localhost',
  port: 1025,
  secure: false,
  user: '',
  password: '',
  from: 'App <no-reply@example.com>',
};

describe('MailGenerator', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  async function generate() {
    // Inside the repo so the generated helper file can be imported.
    dir = await mkdtemp(path.join(process.cwd(), 'test', '.tmp-mail-'));

    const fs = createFileSystem();
    const config = resolveConfig({ projectName: 'test-api', mail: true });

    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test-api', scripts: {}, dependencies: {}, devDependencies: {} }),
    );

    await new MailGenerator().generate(
      createGenerationContext(
        config,
        dir,
        fs,
        createTemplateLoader(getTemplatesDirectory(), fs),
        createTemplateRenderer(),
      ),
    );

    const read = (relative: string) => readFile(path.join(dir as string, relative), 'utf8');
    const helpers = (await import(
      /* @vite-ignore */ pathToFileURL(path.join(dir, 'src/infrastructure/mail/mail-options.ts')).href
    )) as Helpers;

    return { read, helpers };
  }

  it('has the mail generator contract', () => {
    const generator = new MailGenerator();

    expect(generator.name).toBe('mail');
    expect(generator.shouldRun(resolveConfig({ projectName: 'test-api', mail: true }))).toBe(true);
    expect(generator.shouldRun(resolveConfig({ projectName: 'test-api' }))).toBe(false);
  });

  it('works without Redis, because mail does not need it', () => {
    expect(resolveConfig({ projectName: 'test-api', mail: true }).mail).toBe(true);
  });

  it('writes the module, the service and the pure options helper', async () => {
    const { read } = await generate();

    expect(await read('src/infrastructure/mail/mail.module.ts')).toContain('MailModule');
    expect(await read('src/infrastructure/mail/mail.service.ts')).toContain('MailService');
    expect(await read('src/infrastructure/mail/mail-options.ts')).toContain('toTransportOptions');
  });

  it('adds nodemailer as a dependency and its types as a devDependency', async () => {
    await generate();
    const pkg = JSON.parse(await readFile(path.join(dir as string, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.dependencies.nodemailer).toBe('10.6.0');
    expect(pkg.devDependencies['@types/nodemailer']).toBe('8.0.2');
    expect(pkg.dependencies['@types/nodemailer']).toBeUndefined();
  });

  it('makes MailModule global and exports MailService', async () => {
    const { read } = await generate();
    const source = await read('src/infrastructure/mail/mail.module.ts');

    expect(source).toContain('@Global()');
    expect(source).toMatch(/exports:\s*\[MailService\]/);
  });

  it('reads the settings from ConfigService, not process.env', async () => {
    const { read } = await generate();
    const source = await read('src/infrastructure/mail/mail.module.ts');

    expect(source).toContain("configService.get");
    expect(source).toContain("'mail'");
    expect(source).not.toContain('process.env');
  });

  it('closes the transport on shutdown', async () => {
    const { read } = await generate();
    const source = await read('src/infrastructure/mail/mail.service.ts');

    expect(source).toContain('OnModuleDestroy');
    expect(source).toContain('.close()');
  });

  describe('toTransportOptions', () => {
    it('maps the settings to SMTP options without auth when no credentials are set', async () => {
      const { helpers } = await generate();

      expect(helpers.toTransportOptions(baseConfig)).toEqual({
        host: 'localhost',
        port: 1025,
        secure: false,
      });
    });

    it('adds auth when both user and password are set', async () => {
      const { helpers } = await generate();

      expect(
        helpers.toTransportOptions({ ...baseConfig, user: 'apikey', password: 's3cret' }),
      ).toEqual({
        host: 'localhost',
        port: 1025,
        secure: false,
        auth: { user: 'apikey', pass: 's3cret' },
      });
    });

    it('passes secure through for implicit TLS (port 465)', async () => {
      const { helpers } = await generate();

      expect(
        helpers.toTransportOptions({ ...baseConfig, port: 465, secure: true }),
      ).toMatchObject({ port: 465, secure: true });
    });

    it('refuses a user without a password and a password without a user', async () => {
      const { helpers } = await generate();

      expect(() => helpers.toTransportOptions({ ...baseConfig, user: 'apikey' })).toThrow(
        /MAIL_USER and MAIL_PASSWORD must be set together/,
      );
      expect(() => helpers.toTransportOptions({ ...baseConfig, password: 'x' })).toThrow(
        /MAIL_USER and MAIL_PASSWORD must be set together/,
      );
    });
  });

  describe('toMailOptions', () => {
    it('fills in the configured sender and keeps the recipients and body', async () => {
      const { helpers } = await generate();

      expect(
        helpers.toMailOptions({ to: 'a@example.com', subject: 'Hi', text: 'Hello' }, baseConfig.from),
      ).toEqual({
        from: baseConfig.from,
        to: 'a@example.com',
        subject: 'Hi',
        text: 'Hello',
      });
    });

    it('lets a message override the sender and carries optional fields', async () => {
      const { helpers } = await generate();

      const options = helpers.toMailOptions(
        {
          from: 'Other <other@example.com>',
          to: ['a@example.com', 'b@example.com'],
          cc: 'c@example.com',
          bcc: ['d@example.com'],
          replyTo: 'support@example.com',
          subject: 'Hi',
          html: '<p>Hello</p>',
        },
        baseConfig.from,
      );

      expect(options).toEqual({
        from: 'Other <other@example.com>',
        to: ['a@example.com', 'b@example.com'],
        cc: 'c@example.com',
        bcc: ['d@example.com'],
        replyTo: 'support@example.com',
        subject: 'Hi',
        html: '<p>Hello</p>',
      });
    });

    it('does not add keys the message did not have', async () => {
      const { helpers } = await generate();

      const options = helpers.toMailOptions(
        { to: 'a@example.com', subject: 'Hi', text: 'Hello' },
        baseConfig.from,
      );

      expect(Object.keys(options).sort()).toEqual(['from', 'subject', 'text', 'to']);
    });

    it('requires a recipient', async () => {
      const { helpers } = await generate();

      expect(() => helpers.toMailOptions({ to: [], subject: 'Hi', text: 'x' }, baseConfig.from)).toThrow(
        /at least one recipient/i,
      );
      expect(() => helpers.toMailOptions({ to: '', subject: 'Hi', text: 'x' }, baseConfig.from)).toThrow(
        /at least one recipient/i,
      );
    });

    it('requires a subject', async () => {
      const { helpers } = await generate();

      expect(() => helpers.toMailOptions({ to: 'a@example.com', subject: ' ', text: 'x' }, baseConfig.from)).toThrow(
        /subject/i,
      );
    });

    it('requires a text or html body', async () => {
      const { helpers } = await generate();

      expect(() => helpers.toMailOptions({ to: 'a@example.com', subject: 'Hi' }, baseConfig.from)).toThrow(
        /text or html/i,
      );
    });

    it('refuses line breaks in the subject, which would inject headers', async () => {
      const { helpers } = await generate();

      expect(() =>
        helpers.toMailOptions(
          { to: 'a@example.com', subject: 'Hi\r\nBcc: evil@example.com', text: 'x' },
          baseConfig.from,
        ),
      ).toThrow(/line break/i);
    });
  });
});
