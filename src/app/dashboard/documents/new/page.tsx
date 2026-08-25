import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"

// QUOTE is scaffolded in the schema (DocumentType) for a phase-2
// quote -> invoice conversion feature, but has no editor yet - deliberately
// left out of this list.
const templates = [
  { type: "INVOICE", title: "Invoice", desc: "Bill a client, with tax and a shareable link." },
  { type: "CONTRACT", title: "Contract", desc: "Scope + terms, with in-browser e-signature." },
]

export default async function NewDocumentPage(props: { searchParams: Promise<{ client?: string }> }) {
  const searchParams = await props.searchParams
  const clientParam = searchParams.client ? `&client=${searchParams.client}` : ""

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Create Document</h2>
        <p className="text-muted-foreground">Select a type to start. You can pick or change the client inside the editor.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {templates.map((tpl) => (
          <Link key={tpl.type} href={`/dashboard/documents/create?type=${tpl.type}${clientParam}`}>
            <Card className="h-full hover:border-primary transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle className="text-lg">{tpl.title}</CardTitle>
                <CardDescription>{tpl.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
