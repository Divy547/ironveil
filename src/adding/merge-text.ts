import { diff3Merge } from 'node-diff3';

export type TextMerge =
  | { readonly merged: true; readonly text: string }
  | { readonly merged: false; readonly conflicts: number };

const LINE_BREAK = /\r?\n/;

/**
 * Three-way merge of a text file: `ours` is what is on disk, `base` is what
 * Ironveil generated before, `theirs` is what it generates now. Edits on
 * either side survive when they do not overlap; overlapping edits are
 * reported, never guessed.
 *
 * Line endings are compared without their `\r`, so a CRLF checkout is not a
 * change, and the result uses the line ending of `ours`.
 */
export function mergeText(
  ours: string,
  base: string,
  theirs: string,
): TextMerge {
  const lineBreak = ours.includes('\r\n') ? '\r\n' : '\n';

  const regions = diff3Merge(
    ours.split(LINE_BREAK),
    base.split(LINE_BREAK),
    theirs.split(LINE_BREAK),
    { excludeFalseConflicts: true },
  );

  const lines: string[] = [];
  let conflicts = 0;

  for (const region of regions) {
    if (region.conflict !== undefined) {
      conflicts += 1;
    } else {
      lines.push(...region.ok);
    }
  }

  return conflicts > 0
    ? { merged: false, conflicts }
    : { merged: true, text: lines.join(lineBreak) };
}
