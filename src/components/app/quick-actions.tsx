import Link from "next/link"
import type { DocumentType } from "@prisma/client"
import { Card } from "@/components/ui/card"
import { CREATABLE_TYPES, documentKind } from "@/lib/document-kinds"
import { FileText, FileClock, Receipt, FileSignature, UserPlus, Settings, ArrowRight } from "lucide-react"

type Action = {
  href: string
  title: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  /**
   * /dashboard/documents/create is not an idle page - rendering it INSERTs a
   * draft row and redirects. Prefetching it would silently create documents,
   * so those links opt out entirely rather than relying on the fact that
   * `auto` currently stops at the nearest loading.tsx boundary.
   */
  prefetch?: false
}

const TYPE_ICONS: Record<DocumentType, React.ComponentType<{ className?: string }>> = {
  INVOICE: FileText,
  QUOTE: FileClock,
  PROFORMA: Receipt,
  CONTRACT: FileSignature,
}

// Derived from the shared type table, so adding a document type puts it here
// automatically instead of leaving this list quietly out of date.
const documentActions: Action[] = CREATABLE_TYPES.map((type) => {
  const kind = documentKind(type)
  return {
    href: `/dashboard/documents/create?type=${type}`,
    title: `New ${kind.label}`,
    desc: kind.description,
    icon: TYPE_ICONS[type],
    prefetch: false as const,
  }
})

const actions: Action[] = [
  ...documentActions,
  {
    href: "/dashboard/clients/new",
    title: "Add Client",
    desc: "Register a client and its serial code.",
    icon: UserPlus,
  },
  {
    href: "/dashboard/settings/business",
    title: "Business Settings",
    desc: "Branding, currency, tax and payment details.",
    icon: Settings,
  },
]

export function QuickActions() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map(({ href, title, desc, icon: Icon, prefetch }) => (
        <Link key={href} href={href} prefetch={prefetch} className="group/action rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full justify-between transition-colors hover:bg-muted/50 hover:ring-foreground/20">
            <div className="flex items-start justify-between px-(--card-spacing)">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground/80">
                <Icon className="size-4.5" />
              </span>
              <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover/action:opacity-100" />
            </div>
            <div className="space-y-1 px-(--card-spacing)">
              <div className="font-heading text-base leading-snug font-medium">{title}</div>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
