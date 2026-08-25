import Link from "next/link"
import { Card } from "@/components/ui/card"
import { FileText, FileSignature, UserPlus, Settings, ArrowRight } from "lucide-react"

type QuickAction = {
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

const actions: QuickAction[] = [
  {
    href: "/dashboard/documents/create?type=INVOICE",
    title: "New Invoice",
    desc: "Bill a client with tax and a shareable link.",
    icon: FileText,
    prefetch: false,
  },
  {
    href: "/dashboard/documents/create?type=CONTRACT",
    title: "New Contract",
    desc: "Scope and terms with in-browser e-signature.",
    icon: FileSignature,
    prefetch: false,
  },
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
