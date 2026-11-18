/**
 * Thrown when an edit to an existing project file cannot be applied safely
 * (the file does not look the way the editor expects, or the edit would
 * conflict with what is already there). Editors never write a half-applied
 * result: they either return the full edited text or throw this.
 */
export class EditError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'EditError';
  }
}
