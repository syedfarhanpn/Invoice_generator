import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import ClientForm from "../client-form"
import { createClient } from "../actions"

export const metadata = { title: "Add client" }

export default async function NewClientPage() {
  const user = await getCurrentUser()
  // Read here rather than in the form: the form is a Client Component, and
  // this is what "inherit" actually resolves to.
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { currency: true },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Add Client</h2>
        <p className="text-muted-foreground">Their serial code is used in every invoice/contract number.</p>
      </div>
      <ClientForm
        onSubmit={createClient}
        submitLabel="Add Client"
        businessCurrency={profile?.currency ?? "USD"}
      />
    </div>
  )
}
