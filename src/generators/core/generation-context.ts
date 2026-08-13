import type { ForgeKitConfig } from '../../config/index.js';
import type { TemplateLoader } from '../../rendering/template-loader.js';
import type { TemplateRenderer } from '../../rendering/template-renderer.js';
import type { FileSystem } from '../../utils/filesystem.js';

export interface GenerationContext {
  readonly config: ForgeKitConfig;
  readonly destination: string;
  readonly fs: FileSystem;
  readonly loader: TemplateLoader;
  readonly renderer: TemplateRenderer;
}

export function createGenerationContext(
  config: ForgeKitConfig,
  destination: string,
  fs: FileSystem,
  loader: TemplateLoader,
  renderer: TemplateRenderer,
): GenerationContext {
  return Object.freeze({
    config,
    destination,
    fs,
    loader,
    renderer,
  });
}