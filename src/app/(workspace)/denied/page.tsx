import Link from "next/link"
import { ShieldAlert } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { MODULE_LABEL, parseModule } from "@/lib/permissions"

export const metadata = { title: "No access" }

/**
 * Where requirePermission() sends someone who may not be here.
 *
 * It says which module was refused and nothing else. Not who to ask, because
 * the product does not know; not what their role is, because that invites
 * arguing with the screen rather than with a person. The point is to be clear
 * that the refusal was deliberate rather than a broken page.
 */
export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>
}) {
  const { module } = await searchParams
  const known = parseModule(module)

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg bg-tone-warning-bg text-tone-warning">
          <ShieldAlert className="size-5" strokeWidth={1.75} />
        </span>

        <h1 className="text-lg font-semibold tracking-tight">
          {known ? `You do not have access to ${MODULE_LABEL[known]}` : "You do not have access"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role does not include this area. An administrator can change that under Team
          Management.
        </p>

        <Link href="/dashboard" className={`mt-6 ${buttonVariants({ size: "sm" })}`}>
          Back to the overview
        </Link>
      </div>
    </div>
  )
}
