const UNKNOWN_PRISMA_ARGUMENT_PATTERN = /Unknown argument `([^`]+)`/i;

export class PrismaSchemaContractError extends Error {
  readonly model: string;
  readonly field: string;

  constructor(model: string, field: string) {
    super(
      `The server schema is out of date and cannot save ${model}.${field}. Please retry after the server migration is applied.`,
    );
    this.name = 'PrismaSchemaContractError';
    this.model = model;
    this.field = field;
  }
}

export const getUnknownPrismaArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.match(UNKNOWN_PRISMA_ARGUMENT_PATTERN)?.[1] ?? null;
};

export const isPrismaSchemaContractError = (
  error: unknown,
): error is PrismaSchemaContractError => error instanceof PrismaSchemaContractError;

/**
 * A deployment mismatch must fail the write. Retrying after removing the rejected
 * key reports success while discarding user-requested data.
 */
export const requirePrismaSchemaContract = async <T>(
  model: string,
  write: () => Promise<T>,
): Promise<T> => {
  try {
    return await write();
  } catch (error) {
    const field = getUnknownPrismaArgument(error);
    if (field) {
      throw new PrismaSchemaContractError(model, field);
    }
    throw error;
  }
};
