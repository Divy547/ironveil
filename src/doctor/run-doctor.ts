import { renderProject } from '../adding/render-project.js';
import { manifestToConfig, readManifest } from '../manifest/index.js';
import { createFileSystem, type FileSystem } from '../utils/filesystem.js';
import { IRONVEIL_VERSION } from '../version.js';
import { checkDependencies } from './dependency-check.js';
import { checkEnvironment } from './env-check.js';
import { checkFiles } from './file-check.js';
import { checkModules } from './module-check.js';
import type { DoctorReport, Finding, Severity } from './types.js';
import { checkVersion } from './version-check.js';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, note: 2 };

/**
 * Compares the project at `root` with what `ironveil.json` says it should be.
 * Read-only. Throws `ManifestError` when `root` is not an Ironveil project or
 * its manifest is invalid; everything else comes back as findings.
 */
export async function runDoctor(
  root: string,
  fs: FileSystem = createFileSystem(),
): Promise<DoctorReport> {
  const manifest = await readManifest(root, fs);
  const config = manifestToConfig(manifest);

  // What `create` would write for this manifest: the reference for env vars
  // and for the files an enabled feature owns.
  const rendered = await renderProject(config);

  const findings: Finding[] = [
    ...(await checkEnvironment({
      root,
      config,
      expectedExample: rendered.get('.env.example') ?? '',
      fs,
    })),
    ...(await checkModules({ root, manifest, fs })),
    ...(await checkFiles(root, rendered, fs)),
    ...(await checkDependencies(root, config, fs)),
    ...checkVersion(manifest.ironveilVersion, IRONVEIL_VERSION),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    root,
    projectName: manifest.projectName,
    ironveilVersion: manifest.ironveilVersion,
    findings,
    ok: !findings.some((finding) => finding.severity === 'error'),
  };
}
