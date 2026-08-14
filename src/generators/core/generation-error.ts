export interface GenerationErrorOptions {
  readonly projectName?: string;
  readonly generatorName?: string;
  readonly destination?: string;
  readonly cause?: unknown;
}

export class GenerationError extends Error {
  readonly projectName?: string;
  readonly generatorName?: string;
  readonly destination?: string;

  constructor(
    message: string,
    options?: GenerationErrorOptions,
  ) {
    super(
      message,
      options?.cause !== undefined
        ? { cause: options.cause }
        : undefined,
    );
    this.name = 'GenerationError';
    this.projectName = options?.projectName;
    this.generatorName = options?.generatorName;
    this.destination = options?.destination;
  }
}