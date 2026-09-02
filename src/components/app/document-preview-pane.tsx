"use client"

import { useEffect, useRef, useState } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"

/** The document is laid out at a fixed 800px, matching the A4 proportions. */
const PAPER_WIDTH = 800

/**
 * Preview side of the editor.
 *
 * On a phone the two panes cannot sit side by side, so the editor shows one at
 * a time and this pane carries the "Edit" control to get back. It also scales
 * the 800px document down to the available width - otherwise a phone shows
 * roughly the left half of the page with no way to reach the rest.
 *
 * Scaling is done with a transform rather than responsive CSS so the document
 * keeps its exact proportions; the wrapper is sized to the scaled box so no
 * blank space is left behind it.
 */
export function DocumentPreviewPane({
  onEdit,
  remeasureKey,
  children,
}: {
  /** Shown on mobile only, to return to the form. */
  onEdit: () => void
  /**
   * Any value that changes when this pane is revealed. While the pane is
   * display:none it has no box, so the first measurement reads 0 and the
   * ResizeObserver has nothing to report - this re-runs it once shown.
   */
  remeasureKey?: unknown
  children: React.ReactNode
}) {
  const areaRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [paperHeight, setPaperHeight] = useState(0)

  useEffect(() => {
    const area = areaRef.current
    const paper = paperRef.current
    if (!area || !paper) return

    const measure = () => {
      // Never scale up - a wide screen shows the document at its true size.
      const available = area.clientWidth
      setScale(available > 0 && available < PAPER_WIDTH ? available / PAPER_WIDTH : 1)
      setPaperHeight(paper.scrollHeight)
    }

    // Observers fire asynchronously, so this is not a synchronous setState
    // during render or effect.
    const ro = new ResizeObserver(measure)
    ro.observe(area)
    ro.observe(paper)
    measure()
    return () => ro.disconnect()
  }, [remeasureKey])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-muted/30">
      {/* Mobile-only bar: the desktop layout shows both panes at once. */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2 md:hidden">
        <span className="text-sm font-medium">Preview</span>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="mr-2 size-4" /> Edit
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div ref={areaRef} className="w-full">
          <div
            style={{
              width: PAPER_WIDTH * scale,
              height: paperHeight ? paperHeight * scale : undefined,
              margin: "0 auto",
            }}
          >
            <div
              ref={paperRef}
              style={{ width: PAPER_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
