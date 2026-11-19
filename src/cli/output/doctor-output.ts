import type { DoctorReport, Severity } from '../../doctor/index.js';

const LABELS: Record<Severity, string> = {
  error: 'error  ',
  warning: 'warning',
  note: 'note   ',
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function formatDoctorReport(report: DoctorReport): string {
  const count = (severity: Severity) =>
    report.findings.filter((finding) => finding.severity === severity).length;
  const errors = count('error');
  const warnings = count('warning');
  const notes = count('note');

  const lines = [
    `Ironveil doctor: ${report.projectName} (created with Ironveil ${report.ironveilVersion})`,
  ];

  if (report.findings.length > 0) {
    lines.push('');
    for (const finding of report.findings) {
      lines.push(`  ${LABELS[finding.severity]} [${finding.check}] ${finding.message}`);
      if (finding.fix !== undefined) lines.push(`           Fix: ${finding.fix}`);
    }
  }

  const parts = [
    errors > 0 ? plural(errors, 'error') : undefined,
    warnings > 0 ? plural(warnings, 'warning') : undefined,
    notes > 0 ? plural(notes, 'note') : undefined,
  ].filter((part): part is string => part !== undefined);

  lines.push(
    '',
    errors === 0 && warnings === 0
      ? `No problems found${notes > 0 ? ` (${plural(notes, 'note')})` : ''}.`
      : `${parts.join(', ')}.`,
  );

  return lines.join('\n');
}
