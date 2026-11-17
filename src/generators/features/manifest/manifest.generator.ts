import path from 'node:path';
import type { IronveilConfig } from '../../../config/index.js';
import {
  MANIFEST_FILE_NAME,
  buildManifest,
  serializeManifest,
} from '../../../manifest/index.js';
import { IRONVEIL_VERSION } from '../../../version.js';
import type { Generator } from '../../core/generator.js';
import type { GenerationContext } from '../../core/generation-context.js';

/**
 * Writes `ironveil.json`, the record every later command (`generate`, `add`,
 * `doctor`) reads to recognise the project. Registered last so it describes
 * exactly what the other generators were asked to produce.
 */
export class ManifestGenerator implements Generator {
  readonly name = 'manifest';

  shouldRun(_config: IronveilConfig): boolean {
    return true;
  }

  async generate(context: GenerationContext): Promise<void> {
    await context.fs.writeFile(
      path.join(context.destination, MANIFEST_FILE_NAME),
      serializeManifest(buildManifest(context.config, IRONVEIL_VERSION)),
    );
  }
}
