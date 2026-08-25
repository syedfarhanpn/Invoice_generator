import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import crypto from 'node:crypto'

const connectionString = process.env.DATABASE_URL
const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Self-contained on purpose (no imports from src/lib) - this runs via
// `npx tsx prisma/seed.ts` outside the Next.js app, so it doesn't rely on
// the "@/*" path alias resolving under tsx. Mirrors the same logic as
// src/lib/hash.ts and src/lib/snapshot.ts by hand.
function hashContent(content: unknown): string {
  function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeysDeep)
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce((acc: Record<string, unknown>, key) => {
          acc[key] = sortKeysDeep((value as Record<string, unknown>)[key])
          return acc
        }, {})
    }
    return value
  }
  return crypto.createHash('sha256').update(JSON.stringify(sortKeysDeep(content))).digest('hex')
}

function slug(): string {
  return crypto.randomBytes(16).toString('base64url')
}

async function main() {
  console.log('Starting seed...')

  const adminEmail = process.env.SUPER_ADMIN_EMAIL
  if (!adminEmail) {
    console.warn(
      'SUPER_ADMIN_EMAIL is not set - seeding with a placeholder email. ' +
        'Set SUPER_ADMIN_EMAIL in .env and re-seed so the demo data shows up under your real login.'
    )
  }
  const userEmail = adminEmail || 'demo@example.com'

  // Idempotent: wipe this user's data (not other users, though this is a
  // single-admin app so there should only ever be one) and rebuild it.
  const existing = await prisma.user.findUnique({ where: { email: userEmail } })
  if (existing) {
    await prisma.document.deleteMany({ where: { userId: existing.id } })
    await prisma.client.deleteMany({ where: { userId: existing.id } })
    await prisma.businessProfile.deleteMany({ where: { userId: existing.id } })
    await prisma.user.delete({ where: { id: existing.id } })
  }

  const user = await prisma.user.create({ data: { email: userEmail } })
  console.log('Created User:', user.email)

  const businessProfile = await prisma.businessProfile.create({
    data: {
      userId: user.id,
      businessName: 'Acme Design Co.',
      ownerName: 'Alice Acme',
      email: 'hello@acmedesign.com',
      phone: '+1 (555) 123-4567',
      address: '123 Creative Lane, Suite 100, New York, NY 10001',
      website: 'www.acmedesign.com',
      brandColor: '#4f46e5',
      currency: 'USD',
      paymentMethod: 'Bank Transfer',
      bankName: 'Creative Bank',
      accountNumber: '123456789',
      routingSwift: 'CRBANKUS33',
      defaultTaxMode: 'NONE',
      defaultPaymentTermDays: 15,
      signatureName: 'Alice Acme',
    },
  })
  console.log('Created Business Profile:', businessProfile.businessName)

  const builderCorp = await prisma.client.create({
    data: {
      userId: user.id,
      clientNumber: 1,
      code: 'BLDR',
      fullName: 'Bob Builder',
      businessName: 'Builder Corp',
      email: 'bob@buildercorp.com',
      phone: '+1 (555) 987-6543',
      address: '456 Construction Rd, Chicago, IL 60601',
      tags: ['active', 'high-value'],
      invoiceSeq: 1,
    },
  })

  const silentFilms = await prisma.client.create({
    data: {
      userId: user.id,
      clientNumber: 2,
      code: 'SILN',
      fullName: 'Charlie Chaplin',
      businessName: 'Silent Films Ltd',
      email: 'charlie@silentfilms.com',
      phone: '+1 (555) 111-2222',
      tags: ['video', 'past-client'],
      contractSeq: 1,
    },
  })

  const wonderTech = await prisma.client.create({
    data: {
      userId: user.id,
      clientNumber: 3,
      code: 'WNDR',
      fullName: 'Diana Prince',
      businessName: 'Wonder Tech',
      email: 'diana@wondertech.io',
      tags: ['lead'],
    },
  })
  await prisma.user.update({ where: { id: user.id }, data: { clientSeq: 3 } })
  console.log('Created Clients')

  // --- Invoice 1: finalized, fully paid ---
  const invoice1Content = {
    lineItems: [
      { description: 'Homepage Design', qty: 1, rate: 1500 },
      { description: 'Internal Pages (x5)', qty: 5, rate: 400 },
      { description: 'Development Handoff', qty: 1, rate: 1000 },
    ],
    notes: 'Thank you for your business!',
    snapshot: {
      issuer: {
        businessName: businessProfile.businessName,
        ownerName: businessProfile.ownerName,
        email: businessProfile.email,
        phone: businessProfile.phone,
        address: businessProfile.address,
        website: businessProfile.website,
        taxId: businessProfile.taxId,
        logoUrl: businessProfile.logoUrl,
        brandColor: businessProfile.brandColor,
        paymentMethod: businessProfile.paymentMethod,
        bankName: businessProfile.bankName,
        accountNumber: businessProfile.accountNumber,
        routingSwift: businessProfile.routingSwift,
        upiId: businessProfile.upiId,
      },
      client: {
        code: builderCorp.code,
        fullName: builderCorp.fullName,
        businessName: builderCorp.businessName,
        email: builderCorp.email,
        phone: builderCorp.phone,
        address: builderCorp.address,
        taxId: builderCorp.taxId,
      },
    },
  }
  const invoice1 = await prisma.document.create({
    data: {
      userId: user.id,
      clientId: builderCorp.id,
      type: 'INVOICE',
      status: 'FINALIZED',
      refNumber: 'INV-BLDR-001',
      sequence: 1,
      title: 'Website Redesign',
      currency: 'USD',
      subtotal: 4500,
      taxAmount: 0,
      totalAmount: 4500,
      amountPaid: 4500,
      issueDate: new Date('2026-08-01'),
      dueDate: new Date('2026-08-15'),
      finalizedAt: new Date('2026-08-01'),
      publicSlug: slug(),
      content: invoice1Content as unknown as Prisma.InputJsonValue,
      contentHash: hashContent(invoice1Content),
    },
  })
  await prisma.payment.create({
    data: { documentId: invoice1.id, amount: 4500, paidOn: new Date('2026-08-10'), method: 'Bank Transfer' },
  })
  await prisma.documentActivity.createMany({
    data: [
      { documentId: invoice1.id, event: 'created', createdAt: new Date('2026-07-30') },
      { documentId: invoice1.id, event: 'finalized', createdAt: new Date('2026-08-01') },
      { documentId: invoice1.id, event: 'shared', createdAt: new Date('2026-08-01') },
      { documentId: invoice1.id, event: 'payment_recorded', meta: { amount: 4500 }, createdAt: new Date('2026-08-10') },
    ],
  })

  // --- Contract: finalized, signed ---
  const contract1Content = {
    clauses: [
      { title: 'Scope of Work', body: '4x 10-minute YouTube videos per month, thumbnail design for each video, 2 revisions per video.' },
      { title: 'Payment', body: 'Due on the 1st of each month. Additional revisions billed at $75/hr.' },
    ],
    effectiveDate: '2026-08-15',
    scopeSummary: 'Monthly YouTube editing retainer.',
    totalFee: 2000,
    feeNote: 'Billed monthly, due on the 1st.',
    snapshot: {
      issuer: invoice1Content.snapshot.issuer,
      client: {
        code: silentFilms.code,
        fullName: silentFilms.fullName,
        businessName: silentFilms.businessName,
        email: silentFilms.email,
        phone: silentFilms.phone,
        address: silentFilms.address,
        taxId: silentFilms.taxId,
      },
    },
  }
  const contract1 = await prisma.document.create({
    data: {
      userId: user.id,
      clientId: silentFilms.id,
      type: 'CONTRACT',
      status: 'SIGNED',
      refNumber: 'CON-SILN-001',
      sequence: 1,
      title: 'Video Editing Retainer',
      currency: 'USD',
      totalAmount: 2000,
      issueDate: new Date('2026-08-15'),
      finalizedAt: new Date('2026-08-15'),
      publicSlug: slug(),
      content: contract1Content as unknown as Prisma.InputJsonValue,
      contentHash: hashContent(contract1Content),
      signatureData: {
        method: 'typed',
        typedName: 'Charlie Chaplin',
        signedAt: new Date('2026-08-16').toISOString(),
        contentHashAtSigning: hashContent(contract1Content),
      },
    },
  })
  await prisma.documentActivity.createMany({
    data: [
      { documentId: contract1.id, event: 'created', createdAt: new Date('2026-08-14') },
      { documentId: contract1.id, event: 'finalized', createdAt: new Date('2026-08-15') },
      { documentId: contract1.id, event: 'shared', createdAt: new Date('2026-08-15') },
      { documentId: contract1.id, event: 'signed', createdAt: new Date('2026-08-16') },
    ],
  })

  // --- Invoice 2: still a draft (no client-facing number yet) ---
  const invoice2 = await prisma.document.create({
    data: {
      userId: user.id,
      clientId: wonderTech.id,
      type: 'INVOICE',
      status: 'DRAFT',
      title: 'Consulting Session',
      currency: 'USD',
      content: {
        lineItems: [{ description: '2-Hour Strategy Call', qty: 2, rate: 250 }],
        notes: '',
      },
    },
  })
  await prisma.documentActivity.create({ data: { documentId: invoice2.id, event: 'created' } })

  console.log('Created Documents (1 paid invoice, 1 signed contract, 1 draft invoice)')
  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
