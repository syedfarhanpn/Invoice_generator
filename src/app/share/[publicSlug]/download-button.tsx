"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { logDownload } from "../actions"

export default function DownloadButton({ documentId }: { documentId: string }) {
  const searchParams = useSearchParams()
  const autoPrint = searchParams.get("print") === "1"

  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [autoPrint])

  function handleClick() {
    logDownload(documentId)
    window.print()
  }

  return (
    <Button onClick={handleClick} className="no-print">
      <Download className="w-4 h-4 mr-2" /> Download PDF
    </Button>
  )
}
