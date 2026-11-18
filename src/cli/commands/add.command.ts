import type { Command } from 'commander';
import { ADDABLE_FEATURES, planAdd } from '../../adding/index.js';
import { findProjectRoot } from '../../manifest/index.js';
import { addSafetyOptions, applyChanges, type SafetyOptions } from '../../safety/index.js';
import { formatAddDryRun, formatAddResult } from '../output/add-output.js';
import { formatEditFailure } from '../output/generate-output.js';

export function registerAddCommand(program: Command): void {
  const add = program
    .command('add <feature> [mode]')
    .description(
      `Add a feature to an existing Ironveil project (${ADDABLE_FEATURES.join(', ')}). ` +
        '"ai" takes a mode: agents (default) or all. Your own edits are merged, never overwritten; nothing is installed.',
    );

  addSafetyOptions(add);

  add.action(
    async (feature: string, mode: string | undefined, options: SafetyOptions) => {
      try {
        const root = await findProjectRoot(process.cwd());
        const plan = await planAdd({ root, feature, mode });
        const result = await applyChanges(plan.changeSet, {
          dryRun: options.dryRun,
          force: options.force,
        });

        console.log(
          options.dryRun === true
            ? formatAddDryRun(plan, result)
            : formatAddResult(plan, result),
        );
      } catch (error) {
        process.exitCode = 1;
        console.error(formatEditFailure(error));
      }
    },
  );
}
