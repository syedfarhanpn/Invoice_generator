"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Link as LinkIcon, Copy, RefreshCw, Ban, ExternalLink, Download } from "lucide-react"
import { regenerateShareLink, revokeShareLink } from "./actions"

export default function SharePanel({
  documentId,
  publicSlug,
}: {
  documentId: string
  publicSlug: string | null
}) {
  const router = useRouter()
  const [origin, setOrigin] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const shareUrl = publicSlug ? `${origin}/share/${publicSlug}` : null

  async function handleRegenerate() {
    setBusy(true)
    try {
      await regenerateShareLink(documentId)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke this share link? The current link will stop working immediately.")) return
    setBusy(true)
    try {
      await revokeShareLink(documentId)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function handleCopy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!publicSlug) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Link revoked</span>
        <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={busy}>
          <LinkIcon className="w-4 h-4 mr-2" /> Generate link
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={shareUrl ?? "..."} className="h-8 w-56 text-xs font-mono" onFocus={(e) => e.currentTarget.select()} />
      <Button variant="outline" size="sm" onClick={handleCopy}>
        <Copy className="w-4 h-4 mr-2" /> {copied ? "Copied" : "Copy"}
      </Button>
      {shareUrl && (
        <>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex">
            <Button type="button" variant="outline" size="sm">
              <ExternalLink className="w-4 h-4 mr-2" /> Open
            </Button>
          </a>
          <a href={`${shareUrl}?print=1`} target="_blank" rel="noreferrer" className="inline-flex">
            <Button type="button" variant="default" size="sm">
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
          </a>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy} title="Regenerate link (invalidates the old one)">
        <RefreshCw className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={busy} title="Revoke link">
        <Ban className="w-4 h-4" />
      </Button>
    </div>
  )
}
