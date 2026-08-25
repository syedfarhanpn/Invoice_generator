// Shape of Document.content (a Json column) for each DocumentType. TypeScript
// types only - Prisma stores this as untyped Json, so every read site should
// still treat the shape defensively (a hand-edited row could violate it).

export type InvoiceLineItem = {
  description: string
  qty: number
  rate: number
}

// Frozen at finalize time from live BusinessProfile/Client rows (see
// src/lib/snapshot.ts) so a later address or name change never rewrites a
// document that's already gone out. Present once status leaves DRAFT.
export type IssuerSnapshot = {
  businessName: string
  ownerName: string
  email: string
  phone?: string | null
  address?: string | null
  website?: string | null
  taxId?: string | null
  logoUrl?: string | null
  brandColor?: string | null
  paymentMethod?: string | null
  bankName?: string | null
  accountNumber?: string | null
  routingSwift?: string | null
  upiId?: string | null
}

export type ClientSnapshot = {
  code: string
  fullName: string
  businessName?: string | null
  email: string
  phone?: string | null
  address?: string | null
  taxId?: string | null
}

export type DocumentSnapshot = {
  issuer: IssuerSnapshot
  client: ClientSnapshot | null
}

export type InvoiceContent = {
  lineItems: InvoiceLineItem[]
  notes?: string
  snapshot?: DocumentSnapshot
}

export type ContractClause = {
  title: string
  body: string
}

export type ContractContent = {
  clauses: ContractClause[]
  effectiveDate?: string | null
  scopeSummary?: string
  totalFee?: number | null
  feeNote?: string
  snapshot?: DocumentSnapshot
}

export type SignaturePayload = {
  method: "typed" | "drawn"
  typedName?: string
  drawnDataUrl?: string
  signedAt: string
  ipHash?: string
  userAgent?: string
  contentHashAtSigning: string
}
