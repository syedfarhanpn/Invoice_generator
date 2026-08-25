import type { BusinessProfile, Client } from "@prisma/client"
import type { DocumentSnapshot } from "./types"

/**
 * Freezes the issuer (business) and client details onto a document at
 * finalize time. After this, the rendered document reads only from
 * `content.snapshot` - never live BusinessProfile/Client rows - so editing
 * your address or a client's name next year can't retroactively change an
 * invoice you already sent. See prisma/schema.prisma's comment on
 * Document.content for the same note.
 */
export function buildSnapshot(
  businessProfile: BusinessProfile | null,
  client: Client | null
): DocumentSnapshot {
  return {
    issuer: {
      businessName: businessProfile?.businessName ?? "",
      ownerName: businessProfile?.ownerName ?? "",
      email: businessProfile?.email ?? "",
      phone: businessProfile?.phone ?? null,
      address: businessProfile?.address ?? null,
      website: businessProfile?.website ?? null,
      taxId: businessProfile?.taxId ?? null,
      logoUrl: businessProfile?.logoUrl ?? null,
      brandColor: businessProfile?.brandColor ?? null,
      paymentMethod: businessProfile?.paymentMethod ?? null,
      bankName: businessProfile?.bankName ?? null,
      accountNumber: businessProfile?.accountNumber ?? null,
      routingSwift: businessProfile?.routingSwift ?? null,
      upiId: businessProfile?.upiId ?? null,
    },
    client: client
      ? {
          code: client.code,
          fullName: client.fullName,
          businessName: client.businessName,
          email: client.email,
          phone: client.phone,
          address: client.address,
          taxId: client.taxId,
        }
      : null,
  }
}
