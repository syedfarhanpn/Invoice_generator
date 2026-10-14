import { Prisma } from "@prisma/client"

/**
 * Writing a whole column's positions in ONE statement.
 *
 * This replaces a loop of one UPDATE per card. That loop was fine while a
 * column held tens of rows and became a bug the moment one held hundreds:
 * the updates run sequentially inside an interactive transaction, Prisma
 * gives those five seconds by default, and three hundred round trips to a
 * pooled Postgres do not fit. The transaction rolled back, the move was
 * refused, and the board said "that move did not save" - on a move that was
 * perfectly legal and had simply taken too long to write.
 *
 * One statement is also one round trip, so the cost no longer scales with
 * the size of the column at all.
 *
 * The table is chosen from a fixed map rather than interpolated. A board's
 * kind decides it, never anything a request carries, and `Prisma.sql`
 * fragments cannot be built from a string at the call site by accident.
 */

const TABLES = {
  deal: Prisma.sql`crm."Deal"`,
  project: Prisma.sql`crm."Project"`,
  task: Prisma.sql`crm."Task"`,
} as const

export type OrderedTable = keyof typeof TABLES

/** The minimum of a transaction client this needs. */
type RawCapable = { $executeRaw: (query: TemplateStringsArray | Prisma.Sql) => Promise<number> }

/**
 * Sets `position` on every row named, scoped to one owner.
 *
 * unnest turns the two arrays into rows, which the UPDATE joins against - so
 * the statement is the same shape whether it renumbers three cards or three
 * hundred. The userId predicate is defence in depth: the ids were already
 * read under that scope, and this makes a mistake there unable to write
 * across workspaces.
 */
export async function renumber(
  tx: RawCapable,
  table: OrderedTable,
  userId: string,
  ordered: { id: string; position: number }[]
): Promise<void> {
  if (ordered.length === 0) return

  const ids = ordered.map((row) => row.id)
  const positions = ordered.map((row) => row.position)

  await tx.$executeRaw(Prisma.sql`
    UPDATE ${TABLES[table]} AS t
    SET "position" = v.pos
    FROM (
      SELECT unnest(${ids}::text[]) AS id, unnest(${positions}::int[]) AS pos
    ) AS v
    WHERE t.id = v.id
      AND t."userId" = ${userId}
      AND t."position" IS DISTINCT FROM v.pos
  `)
}
