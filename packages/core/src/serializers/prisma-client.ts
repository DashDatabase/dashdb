// Values Prisma Client computes in application code rather than in the database. They survive
// in the IR as column metadata (`prismaDefault`, `prismaUpdatedAt`) but have no SQL default.
import type { Column } from '../ir/types';
import type { SchemaModel } from './model';

/** `@default(...)` functions Prisma Client evaluates itself (`uuid(7)`, `cuid(2)` included). */
export const CLIENT_GENERATED = /^(?:uuid|cuid|nanoid|ulid)\(\d*\)$/;

/** Warns that SQL output has no default for a value Prisma Client used to generate. */
export function warnClientGenerated(model: SchemaModel, column: Column, element: string): void {
  const generator = column.default === null ? column.metadata.prismaDefault : undefined;
  if (generator && CLIENT_GENERATED.test(generator)) {
    model.warn(
      'unsupported-feature',
      element,
      `Prisma Client generates ${generator} values; the database column has no default`,
    );
  }
  if (column.metadata.prismaUpdatedAt) {
    model.warn(
      'unsupported-feature',
      element,
      'Prisma Client sets @updatedAt values; the database does not update this column itself',
    );
  }
}
