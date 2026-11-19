import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';
import { IRONVEIL_VERSIONS } from '../../../config/versions.js';
import { createPackageManifest } from '../../../utils/package-manifest.js';

const MAIL_TEMPLATES = [
  {
    source: 'mail/src/infrastructure/mail/mail.module.ts.template',
    destination: 'src/infrastructure/mail/mail.module.ts',
  },
  {
    source: 'mail/src/infrastructure/mail/mail.service.ts.template',
    destination: 'src/infrastructure/mail/mail.service.ts',
  },
  {
    source: 'mail/src/infrastructure/mail/mail-options.ts.template',
    destination: 'src/infrastructure/mail/mail-options.ts',
  },
] as const;

export class MailGenerator implements Generator {
  readonly name = 'mail';

  shouldRun(config: IronveilConfig): boolean {
    return config.mail;
  }

  async generate(context: GenerationContext): Promise<void> {
    const manifest = createPackageManifest(
      context.destination,
      context.fs,
    );

    await manifest.addDependencies(IRONVEIL_VERSIONS.dependencies.mail);
    await manifest.addDevDependencies(IRONVEIL_VERSIONS.devDependencies.mail);

    for (const template of MAIL_TEMPLATES) {
      const source = await context.loader.load(template.source);

      const rendered = context.renderer.render(
        source,
        context.config,
      );

      await context.fs.writeFile(
        path.join(context.destination, template.destination),
        rendered,
      );
    }
  }
}
