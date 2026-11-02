import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

import { viewingOrgId } from '@/lib/viewing'
import { allowedWhileViewing, isWriteOperation, VIEWING_READ_ONLY_MESSAGE } from '@/lib/viewing-rules'

const connectionString = `${process.env.DATABASE_URL}`

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)

/**
 * Viewing a company is read-only, enforced here rather than action by action.
 *
 * Every action already checks its module permission, and viewing caps those
 * at "read" - but that is a promise kept by each of a hundred call sites,
 * and the one that forgot would change a tenant's real records with nothing
 * to show who did it. This is the backstop that does not depend on anyone
 * remembering: while the viewing cookie is set, no write reaches the
 * database, transactions and raw statements included.
 *
 * The cookie is only read for writes, so reads pay nothing for this.
 */
const readOnlyWhileViewing = Prisma.defineExtension({
  name: 'read-only-while-viewing',
  query: {
    async $allOperations({ model, operation, args, query }) {
      if (
        isWriteOperation(operation) &&
        !allowedWhileViewing(model, operation, args) &&
        (await viewingOrgId())
      ) {
        throw new Error(VIEWING_READ_ONLY_MESSAGE)
      }
      return query(args)
    },
  },
})

// Typed as the plain client on purpose. The extension only intercepts
// queries - it adds no models, fields or methods - so the API is unchanged,
// and the extended type would otherwise stop every helper that takes a
// Prisma.TransactionClient from accepting the `tx` it is handed.
const prismaClientSingleton = (): PrismaClient => {
  return new PrismaClient({ adapter }).$extends(readOnlyWhileViewing) as unknown as PrismaClient
}

declare global {
  var prismaGlobalV3: undefined | ReturnType<typeof prismaClientSingleton>
}

// V3: the client is now extended, so a dev server holding a V2 instance from
// before this change must not keep handing out the unguarded one.
const prisma = globalThis.prismaGlobalV3 ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobalV3 = prisma
