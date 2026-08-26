"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"

/** Scoped to the dashboard so the header and nav stay mounted and usable. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard route error:", error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">This page could not load</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Your data is untouched - this failed while reading, not writing.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
