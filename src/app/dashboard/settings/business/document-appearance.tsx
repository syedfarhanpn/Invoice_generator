"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DocumentSurface } from "@/components/app/document-surface"
import {
  DEFAULT_DOCUMENT_FONT,
  DEFAULT_PAPER_COLOR,
  DOCUMENT_FONTS,
  PAPER_PRESETS,
  parseDocumentFont,
  parsePaperColor,
  type DocumentFont,
} from "@/lib/document-theme"
import { cn } from "@/lib/utils"

/**
 * Paper colour and typeface for generated documents.
 *
 * Client-side so the sample below re-renders as you pick - the whole point is
 * seeing the combination before it goes out to a client. Both values submit
 * with the surrounding profile form.
 */
export function DocumentAppearance({
  paperColor,
  documentFont,
}: {
  paperColor: string | null
  documentFont: string | null
}) {
  const [paper, setPaper] = useState(() => parsePaperColor(paperColor ?? DEFAULT_PAPER_COLOR))
  const [font, setFont] = useState<DocumentFont>(() =>
    parseDocumentFont(documentFont ?? DEFAULT_DOCUMENT_FONT)
  )

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="documentFont">Typeface</Label>
          <Select
            name="documentFont"
            value={font}
            onValueChange={(value) => setFont(parseDocumentFont(value))}
          >
            <SelectTrigger id="documentFont">
              <SelectValue>
                {(value: string) =>
                  DOCUMENT_FONTS.find((f) => f.value === value)?.label ?? "Serif"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_FONTS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paperColor">Paper colour</Label>
          <div className="flex items-center gap-2">
            <Input
              id="paperColor"
              name="paperColor"
              type="color"
              value={paper}
              onChange={(e) => setPaper(parsePaperColor(e.target.value))}
              className="w-12 p-1"
            />
            <div className="flex gap-1.5">
              {PAPER_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.label}
                  aria-label={`Use ${preset.label} paper`}
                  aria-pressed={paper === preset.value}
                  onClick={() => setPaper(preset.value)}
                  style={{ backgroundColor: preset.value }}
                  className={cn(
                    "size-7 rounded-full border transition-[box-shadow]",
                    paper === preset.value && "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  )}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Ink, rules and shading are derived from the paper, so the text stays readable
            whatever you pick. Signatures always print on a light panel.
          </p>
        </div>
      </div>

      {/* Not the real document, just enough of it to judge the combination. */}
      <div className="space-y-2">
        <Label>Preview</Label>
        <DocumentSurface paper={paper} font={font} className="rounded-lg border p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Invoice
          </div>
          <div className="mt-1 text-2xl font-extrabold tracking-tight">INV-0001</div>
          <div className="mt-4 flex justify-between border-b pb-2 text-sm">
            <span className="text-muted-foreground">Design retainer</span>
            <span className="font-medium">1,200.00</span>
          </div>
          <div className="flex justify-between pt-2 text-sm">
            <span className="font-bold uppercase tracking-wide">Total</span>
            <span className="font-extrabold">1,200.00</span>
          </div>
        </DocumentSurface>
      </div>
    </div>
  )
}
