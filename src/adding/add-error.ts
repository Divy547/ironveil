/**
 * Thrown when `ironveil add` cannot apply a feature: an unknown feature, or
 * files of the user's that it cannot merge with. Nothing has been written when
 * this is thrown.
 */
export class AddError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddError';
  }
}
