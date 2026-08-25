import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants, Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import prisma from "@/lib/db"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/current-user"
import { archiveClient } from "../actions"
import { LifecycleBadge, PaymentBadge } from "@/components/app/status-badge"
import { formatMoney } from "@/lib/money"

export default async function ClientProfilePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const user = await getCurrentUser()

  const client = await prisma.client.findUnique({
    where: { id: params.id, userId: user.id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!client) return notFound()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard/clients" className="hover:underline">Clients</Link>
            <span>/</span>
            <span>{client.fullName}</span>
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight">{client.fullName}</h2>
            <Badge variant="outline" className="font-mono">{client.code}</Badge>
            {client.archivedAt && <Badge variant="secondary">Archived</Badge>}
          </div>
          {client.businessName && <p className="text-muted-foreground text-lg">{client.businessName}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/clients/${client.id}/edit`} className={buttonVariants({ variant: "outline" })}>
            Edit Client
          </Link>
          <form action={archiveClient.bind(null, client.id, !client.archivedAt)}>
            <Button type="submit" variant="outline">{client.archivedAt ? "Unarchive" : "Archive"}</Button>
          </form>
          <Link href={`/dashboard/documents/new?client=${client.id}`} className={buttonVariants()}>
            Create Document
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Email</div>
                <div>{client.email}</div>
              </div>
              {client.phone && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Phone</div>
                  <div>{client.phone}</div>
                </div>
              )}
              {client.address && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Address</div>
                  <div className="whitespace-pre-wrap">{client.address}</div>
                </div>
              )}
              {client.taxId && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Tax ID</div>
                  <div>{client.taxId}</div>
                </div>
              )}
              {client.defaultCurrency && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Default Currency</div>
                  <div>{client.defaultCurrency}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {client.tags && client.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {client.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {client.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                {client.notes}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Document History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-muted ml-3 space-y-6">
                {client.documents.map((doc) => (
                  <div key={doc.id} className="relative pl-6">
                    <div className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/dashboard/documents/${doc.id}`} className="font-semibold hover:underline">
                          {doc.refNumber || doc.title || "Untitled draft"}
                        </Link>
                        <Badge variant="outline">{doc.type}</Badge>
                        <LifecycleBadge status={doc.status} />
                        {doc.type === "INVOICE" && (
                          <PaymentBadge
                            totalAmount={doc.totalAmount ? Number(doc.totalAmount) : null}
                            amountPaid={Number(doc.amountPaid)}
                            dueDate={doc.dueDate}
                            isDraft={doc.status === "DRAFT"}
                            currency={doc.currency}
                          />
                        )}
                        {doc.totalAmount != null && (
                          <span className="ml-auto text-sm font-medium">
                            {formatMoney(Number(doc.totalAmount), doc.currency)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {doc.createdAt.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
                {client.documents.length === 0 && (
                  <div className="pl-6 text-sm text-muted-foreground">
                    No documents generated for this client yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
