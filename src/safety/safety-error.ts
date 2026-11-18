/**
 * Thrown when a command must not touch the project (a path that escapes the
 * project root, a tree with uncommitted work, ...). Nothing has been written
 * when this is thrown.
 */
export class SafetyError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'SafetyError';
  }
}
