"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

/**
 * Route-level error boundary. Next.js replaces a server error's message with
 * an opaque `digest` in production, so nothing sensitive reaches the browser -
 * we surface that digest only so a user can quote it in a bug report.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Replace with your error reporter (Sentry et al) when you add one.
    console.error("Unhandled route error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page failed to load. Nothing you had saved was lost - finalized documents
          are never modified by a failed render.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
