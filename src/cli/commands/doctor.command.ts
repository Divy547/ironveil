import type { Command } from 'commander';
import { runDoctor } from '../../doctor/index.js';
import { findProjectRoot } from '../../manifest/index.js';
import { formatDoctorReport } from '../output/doctor-output.js';

interface DoctorOptions {
  readonly strict?: boolean;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description(
      'Check an Ironveil project against its ironveil.json: missing env vars, unregistered modules, missing files and dependency drift. Read-only.',
    )
    .option('--strict', 'exit with an error code on warnings as well as errors')
    .action(async (options: DoctorOptions) => {
      try {
        const root = await findProjectRoot(process.cwd());
        const report = await runDoctor(root);

        console.log(formatDoctorReport(report));

        const hasWarnings = report.findings.some((finding) => finding.severity === 'warning');
        if (!report.ok || (options.strict === true && hasWarnings)) {
          process.exitCode = 1;
        }
      } catch (error) {
        process.exitCode = 1;
        console.error(error instanceof Error ? error.message : String(error));
      }
    });
}
