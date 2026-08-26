"use client"

import { useEffect } from "react"

/**
 * Public-facing boundary: this is shown to the recipient of a document, not
 * the account owner. It deliberately renders NO error text, digest, or retry
 * internals - an anonymous visitor should never see anything about the
 * system's shape. The real error still goes to the server log.
 */
export default function ShareError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("Public share route error:", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/40 p-8 text-center">
      <h2 className="text-xl font-semibold">This document could not be displayed</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may have expired or been revoked. Please ask the sender for an updated link.
      </p>
    </div>
  )
}
