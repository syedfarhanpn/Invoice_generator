"use client"

import { useState } from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * Downloads the server-rendered PDF.
 *
 * Deliberately not window.print(): pagination varied per browser and printer
 * driver, and the payment footer could be orphaned across a page break. The
 * route sends Content-Disposition: attachment, so the browser saves a file.
 *
 * Whether a "choose location" dialog appears is the visitor's own browser
 * setting ("Ask where to save each file"), which a site cannot control.
 */
export default function DownloadButton({
  publicSlug,
  supported = true,
}: {
  publicSlug: string
  /** False for types with no PDF template yet (contracts). */
  supported?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    if (!supported) {
      window.print()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/share/${publicSlug}/download`)
      if (!res.ok) throw new Error("Could not prepare the PDF.")
      const blob = await res.blob()

      // Read the filename the server chose, rather than guessing one here.
      const disposition = res.headers.get("content-disposition") || ""
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? "document.pdf"

      const url = URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = filename
      window.document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-print flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={busy}>
        {busy ? (
          <>
            <Spinner label="Preparing PDF" className="mr-2" /> Preparing...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </>
        )}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
