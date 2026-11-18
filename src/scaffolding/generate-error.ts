/**
 * Thrown when `ironveil generate` cannot produce what was asked for: a bad
 * name or field spec, or a conflict with what the project already has.
 * Nothing has been written when this is thrown.
 */
export class GenerateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerateError';
  }
}
