import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { planAdd } from '../../src/adding/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { applyChanges } from '../../src/safety/index.js';
import { parseFields, planResource } from '../../src/scaffolding/index.js';
import { createGeneratedProject } from './helpers/generated-project.js';
import {
  assertBootsAndShutsDownCleanly,
  prepareProject,
} from './helpers/runtime-checks.js';
import type { TestServer } from './helpers/test-server.js';

// A fresh database per run: `migrate deploy` creates it.
const stamp = Date.now();
const CREATED_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-mail-e2e-${stamp}?schema=public`;
const ADDED_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-mail-add-e2e-${stamp}?schema=public`;
const MAIL_FROM = 'Mail E2E <no-reply@example.test>';

interface SmtpSink {
  readonly port: number;
  readonly messages: string[];
  readonly envelopes: string[];
  close(): Promise<void>;
}

/**
 * A minimal SMTP server: enough of the protocol for nodemailer to deliver one
 * message, recording the envelope and the raw message. It does not offer
 * STARTTLS or AUTH, which matches `MAIL_SECURE=false` with no credentials.
 */
async function startSmtpSink(): Promise<SmtpSink> {
  const messages: string[] = [];
  const envelopes: string[] = [];

  const server = net.createServer((socket) => {
    let buffer = '';
    let data: string | undefined;

    socket.write('220 sink ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString();

      let end = buffer.indexOf('\r\n');
      while (end >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf('\r\n');

        if (data !== undefined) {
          if (line === '.') {
            messages.push(data);
            data = undefined;
            socket.write('250 queued\r\n');
          } else {
            data += `${line}\r\n`;
          }
          continue;
        }

        const command = line.toUpperCase();
        if (command.startsWith('EHLO')) {
          socket.write('250-sink\r\n250 8BITMIME\r\n');
        } else if (command === 'DATA') {
          data = '';
          socket.write('354 go ahead\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else {
          if (command.startsWith('MAIL FROM') || command.startsWith('RCPT TO')) {
            envelopes.push(line);
          }
          socket.write('250 OK\r\n');
        }
      }
    });
    socket.on('error', () => {});
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;

  return {
    port,
    messages,
    envelopes,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * A feature module written the way AGENTS.md tells an agent to write one: it
 * injects the global MailService and never builds a transport. Lint-clean on
 * purpose, since the pipeline lints it.
 */
const NOTIFY_MODULE = `import { Controller, Module, Post } from '@nestjs/common';
import { MailService } from '../../infrastructure/mail/mail.service';

@Controller('notify')
export class NotifyController {
  constructor(private readonly mail: MailService) {}

  @Post()
  async send(): Promise<{ sent: true }> {
    await this.mail.send({
      to: 'user@example.com',
      subject: 'Hello from the e2e',
      text: 'Hi there',
    });
    return { sent: true };
  }

  @Post('invalid')
  async sendInvalid(): Promise<{ sent: true }> {
    await this.mail.send({ to: [], subject: 'No recipient', text: 'x' });
    return { sent: true };
  }
}

@Module({ controllers: [NotifyController] })
export class NotifyModule {}
`;

/** The test AGENTS.md describes: override MailService so nothing connects. */
const NOTIFY_SPEC = `import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { MailService } from '../src/infrastructure/mail/mail.service';

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test_db?schema=public';
// Nothing listens here: the test must not need an SMTP server.
process.env.MAIL_HOST = '127.0.0.1';
process.env.MAIL_PORT = '1';
process.env.MAIL_FROM = 'Test <no-reply@localhost>';

describe('notify (e2e)', () => {
  it('sends through the overridden MailService', async () => {
    const { AppModule } = await import('../src/app.module');
    const { NotifyController } = await import('../src/modules/notify/notify.module');
    const send = jest.fn().mockResolvedValue(undefined);

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .overrideProvider(MailService)
      .useValue({ send })
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    await expect(app.get(NotifyController).send()).resolves.toEqual({ sent: true });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com', subject: 'Hello from the e2e' }),
    );

    await app.close();
  });
});
`;

async function addNotifyModule(root: string): Promise<void> {
  await mkdir(path.join(root, 'src/modules/notify'), { recursive: true });
  await writeFile(path.join(root, 'src/modules/notify/notify.module.ts'), NOTIFY_MODULE);
  await writeFile(path.join(root, 'test/notify.e2e-spec.ts'), NOTIFY_SPEC);

  const appModulePath = path.join(root, 'src/app.module.ts');
  const appModule = await readFile(appModulePath, 'utf8');
  expect(appModule).toContain('HealthModule,');
  await writeFile(
    appModulePath,
    appModule
      .replace(
        "import { HealthModule }",
        "import { NotifyModule } from './modules/notify/notify.module';\nimport { HealthModule }",
      )
      .replace('HealthModule,\n', 'HealthModule,\n    NotifyModule,\n'),
  );
}

/** Sends a real message through the live server and checks what the SMTP sink received. */
function assertMailIsDelivered(sink: SmtpSink) {
  return async (server: TestServer): Promise<void> => {
    const sent = await fetch(`${server.baseUrl}/notify`, { method: 'POST' });
    expect(sent.status).toBe(201);
    expect(await sent.json()).toEqual({ sent: true });

    expect(sink.messages).toHaveLength(1);
    const message = sink.messages[0];
    expect(message).toContain('Subject: Hello from the e2e');
    expect(message).toContain('To: user@example.com');
    expect(message).toContain(`From: ${MAIL_FROM.replace(/ </, ' <')}`);
    expect(message).toContain('Hi there');
    expect(sink.envelopes.join('\n')).toContain('<no-reply@example.test>');
    expect(sink.envelopes.join('\n')).toContain('<user@example.com>');

    // A message without a recipient is refused before anything is sent,
    // and the global filter turns the rejection into a plain 500.
    const invalid = await fetch(`${server.baseUrl}/notify/invalid`, { method: 'POST' });
    expect(invalid.status).toBe(500);
    expect(sink.messages).toHaveLength(1);
  };
}

describe('Ironveil mail E2E', () => {
  let project: Awaited<ReturnType<typeof createGeneratedProject>> | undefined;
  let sink: SmtpSink | undefined;

  afterEach(async () => {
    await project?.cleanup();
    await sink?.close();
    project = undefined;
    sink = undefined;
  });

  function mailEnv(port: number): Record<string, string> {
    return {
      MAIL_HOST: '127.0.0.1',
      MAIL_PORT: String(port),
      MAIL_SECURE: 'false',
      MAIL_FROM,
    };
  }

  it(
    'a project created with mail installs, lints, builds, passes tests that override MailService, delivers a real message over SMTP and shuts down cleanly',
    async () => {
      sink = await startSmtpSink();
      project = await createGeneratedProject(
        resolveConfig({ projectName: 'generated-mail-api', mail: true }),
        'ironveil-mail-e2e',
      );
      await addNotifyModule(project.root);

      await prepareProject(project, {
        databaseUrl: CREATED_DATABASE_URL,
        extra: mailEnv(sink.port),
      });

      await project.assertManifestMatchesVersions();
      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: false,
        exercise: assertMailIsDelivered(sink),
      });
    },
    900_000,
  );

  it(
    'a project that gains mail with `add mail` next to an existing resource builds, passes its tests, delivers a real message and shuts down cleanly',
    async () => {
      sink = await startSmtpSink();
      project = await createGeneratedProject(
        resolveConfig({ projectName: 'generated-mail-add-api' }),
        'ironveil-mail-add-e2e',
      );
      const root = project.root;

      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string price:decimal'),
      });
      await applyChanges(resource.changeSet);

      const plan = await planAdd({ root, feature: 'mail' });
      expect(plan.alreadyEnabled).toBe(false);
      await applyChanges(plan.changeSet);

      await addNotifyModule(root);

      await prepareProject(project, {
        databaseUrl: ADDED_DATABASE_URL,
        extra: mailEnv(sink.port),
      });

      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: false,
        exercise: assertMailIsDelivered(sink),
      });
    },
    900_000,
  );
});
