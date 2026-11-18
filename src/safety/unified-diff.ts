const CONTEXT_LINES = 3;

/**
 * Above this many line pairs (after trimming the unchanged head and tail) the
 * exact LCS table would be too big, so the middle is shown as a full
 * replacement. Real project files never get close.
 */
const MAX_LCS_CELLS = 16_000_000;

type Operation = { readonly kind: ' ' | '-' | '+'; readonly line: string };

/**
 * A unified diff (the format `git diff` prints and `git apply` reads) between
 * two versions of one file. `before` is `null` for a file that does not exist
 * yet. Returns an empty string when nothing changed.
 */
export function unifiedDiff(
  filePath: string,
  before: string | null,
  after: string,
): string {
  if (before === after) {
    return '';
  }

  const oldLines = splitLines(before ?? '');
  const newLines = splitLines(after);
  const hunks = buildHunks(diffLines(oldLines, newLines));

  if (hunks.length === 0) {
    return '';
  }

  const output = [
    before === null ? '--- /dev/null' : `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];
  for (const hunk of hunks) {
    output.push(hunk.header);
    for (const operation of hunk.operations) {
      output.push(`${operation.kind}${operation.line}`);
      if (!operation.line.endsWith('\n')) {
        output.push('\\ No newline at end of file');
      }
    }
  }

  // Lines carry their own terminator; ones without get an explicit newline
  // after the marker above, so join on a newline-aware basis.
  return output
    .map((row) => (row.endsWith('\n') ? row : `${row}\n`))
    .join('');
}

// Every line keeps its terminator ("a\n"), so "b" and "b\n" are different
// lines and a missing final newline shows up as a real change.
function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }

  const lines = text.split(/(?<=\n)/);
  return lines;
}

function diffLines(oldLines: string[], newLines: string[]): Operation[] {
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start += 1;
  }

  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldLines[oldEnd - 1] === newLines[newEnd - 1]
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const middle = diffMiddle(
    oldLines.slice(start, oldEnd),
    newLines.slice(start, newEnd),
  );

  return [
    ...oldLines.slice(0, start).map((line): Operation => ({ kind: ' ', line })),
    ...middle,
    ...oldLines.slice(oldEnd).map((line): Operation => ({ kind: ' ', line })),
  ];
}

function diffMiddle(oldLines: string[], newLines: string[]): Operation[] {
  const rows = oldLines.length;
  const columns = newLines.length;

  if (rows === 0 || columns === 0 || rows * columns > MAX_LCS_CELLS) {
    return [
      ...oldLines.map((line): Operation => ({ kind: '-', line })),
      ...newLines.map((line): Operation => ({ kind: '+', line })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of oldLines[i..] and
  // newLines[j..]; walking forward from (0,0) then yields the diff in order.
  const width = columns + 1;
  const lcs = new Uint32Array((rows + 1) * width);
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      lcs[row * width + column] =
        oldLines[row] === newLines[column]
          ? (lcs[(row + 1) * width + column + 1] ?? 0) + 1
          : Math.max(
              lcs[(row + 1) * width + column] ?? 0,
              lcs[row * width + column + 1] ?? 0,
            );
    }
  }

  const operations: Operation[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    const oldLine = oldLines[row] as string;
    const newLine = newLines[column] as string;

    if (oldLine === newLine) {
      operations.push({ kind: ' ', line: oldLine });
      row += 1;
      column += 1;
    } else if (
      (lcs[(row + 1) * width + column] ?? 0) >=
      (lcs[row * width + column + 1] ?? 0)
    ) {
      operations.push({ kind: '-', line: oldLine });
      row += 1;
    } else {
      operations.push({ kind: '+', line: newLine });
      column += 1;
    }
  }
  for (; row < rows; row += 1) {
    operations.push({ kind: '-', line: oldLines[row] as string });
  }
  for (; column < columns; column += 1) {
    operations.push({ kind: '+', line: newLines[column] as string });
  }

  return operations;
}

interface Hunk {
  readonly header: string;
  readonly operations: Operation[];
}

function buildHunks(operations: Operation[]): Hunk[] {
  const changed: number[] = [];
  operations.forEach((operation, index) => {
    if (operation.kind !== ' ') {
      changed.push(index);
    }
  });

  if (changed.length === 0) {
    return [];
  }

  // Changes whose context windows touch or overlap share a hunk.
  const groups: Array<[number, number]> = [];
  for (const index of changed) {
    const last = groups[groups.length - 1];
    if (last !== undefined && index - last[1] <= 2 * CONTEXT_LINES + 1) {
      last[1] = index;
    } else {
      groups.push([index, index]);
    }
  }

  // Cumulative old/new line counts before each operation.
  const oldBefore: number[] = [];
  const newBefore: number[] = [];
  let oldCount = 0;
  let newCount = 0;
  for (const operation of operations) {
    oldBefore.push(oldCount);
    newBefore.push(newCount);
    if (operation.kind !== '+') {
      oldCount += 1;
    }
    if (operation.kind !== '-') {
      newCount += 1;
    }
  }

  return groups.map(([first, last]) => {
    const from = Math.max(0, first - CONTEXT_LINES);
    const to = Math.min(operations.length - 1, last + CONTEXT_LINES);
    const slice = operations.slice(from, to + 1);

    const oldLength = slice.filter((operation) => operation.kind !== '+').length;
    const newLength = slice.filter((operation) => operation.kind !== '-').length;

    return {
      header: `@@ -${range(oldBefore[from] ?? 0, oldLength)} +${range(newBefore[from] ?? 0, newLength)} @@`,
      operations: slice,
    };
  });
}

// "-3,7": start line and length. A length of 1 is written as just the start,
// and an empty range points at the line *before* it (git's convention).
function range(linesBefore: number, length: number): string {
  if (length === 0) {
    return `${linesBefore},0`;
  }

  const start = linesBefore + 1;
  return length === 1 ? `${start}` : `${start},${length}`;
}
