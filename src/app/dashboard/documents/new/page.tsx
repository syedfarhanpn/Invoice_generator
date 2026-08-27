import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import { CREATABLE_TYPES, documentKind } from "@/lib/document-kinds"

export const metadata = { title: "Create Document" }

export default async function NewDocumentPage(props: { searchParams: Promise<{ client?: string }> }) {
  const searchParams = await props.searchParams
  const clientParam = searchParams.client ? `&client=${searchParams.client}` : ""

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Create Document</h2>
        <p className="text-muted-foreground">Select a type to start. You can pick or change the client inside the editor.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {CREATABLE_TYPES.map((type) => {
          const kind = documentKind(type)
          return (
            // prefetch={false}: this href creates a draft row on render, so a
            // prefetch would leave stray documents behind.
            <Link
              key={type}
              href={`/dashboard/documents/create?type=${type}${clientParam}`}
              prefetch={false}
            >
              <Card className="h-full hover:border-primary transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{kind.label}</CardTitle>
                  <CardDescription>{kind.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
