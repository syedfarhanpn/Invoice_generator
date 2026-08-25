import prisma from "@/lib/db"
import { notFound } from "next/navigation"
import ContractPreview from "@/app/dashboard/documents/[id]/previews/contract-preview"
import SignForm from "./sign-form"
import type { ContractContent } from "@/lib/types"

export default async function SignContractPage(props: { params: Promise<{ publicSlug: string }> }) {
  const params = await props.params
  const document = await prisma.document.findUnique({
    where: { publicSlug: params.publicSlug },
    include: { client: true },
  })

  if (!document || document.type !== "CONTRACT") return notFound()
  if (document.status !== "FINALIZED") return notFound() // already signed, void, or draft

  const businessProfile = await prisma.businessProfile.findUnique({ where: { userId: document.userId } })
  const content = document.content as unknown as ContractContent
  const snapshot = content?.snapshot
  const issuer = snapshot?.issuer ?? businessProfile
  const client = snapshot?.client ?? document.client

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Review &amp; Sign</h1>
          <p className="text-muted-foreground text-sm">
            Read the agreement below, then sign at the bottom to accept it.
          </p>
        </div>

        <div className="bg-background shadow-xl border overflow-hidden">
          <ContractPreview
            refNumber={document.refNumber}
            isDraft={false}
            title={document.title}
            issueDate={document.issueDate}
            currency={document.currency}
            content={content}
            issuer={issuer}
            client={client}
            signature={null}
          />
        </div>

        <SignForm publicSlug={params.publicSlug} />
      </div>
    </div>
  )
}
