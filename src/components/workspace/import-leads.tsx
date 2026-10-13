"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"

import { importLeads } from "@/app/(workspace)/crm/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  LEAD_FIELDS,
  LEAD_FIELD_LABEL,
  parseLeadCsv,
  readHeadings,
  suggestMapping,
  type LeadMapping,
  type ParseResult,
} from "@/lib/lead-import"

import type { LeadStage } from "./add-lead"

/**
 * Importing a lead export.
 *
 * The file is read and parsed IN THE BROWSER, and only the parsed rows are
 * sent to the server. That is what makes the preview possible: you see which
 * columns were understood, which became part of the description and which
 * rows will be skipped, before anything is written. Uploading the file first
 * and finding out afterwards is the version that puts 400 bad rows in your
 * pipeline.
 *
 * Name, email and phone are matched by meaning. Everything else is kept under
 * its own heading, because the questions differ per ad and a fixed mapping
 * would quietly drop whatever this campaign happened to ask.
 */
export function ImportLeads({ stages }: { stages: LeadStage[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  // The file's text is kept so changing the mapping can re-read it without
  // asking for the file again.
  const [text, setText] = useState("")
  const [headings, setHeadings] = useState<string[]>([])
  const [mapping, setMapping] = useState<LeadMapping | null>(null)
  const [fileName, setFileName] = useState("")
  const [source, setSource] = useState("")
  const [stageId, setStageId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; duplicates: number } | null>(null)
  const [pending, startTransition] = useTransition()

  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0]
  const targetStage = stageId || firstStage?.id || ""

  function reset() {
    setParsed(null)
    setText("")
    setHeadings([])
    setMapping(null)
    setFileName("")
    setSource("")
    setError(null)
    setDone(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  /** Re-reads the file under a mapping. Called on load and on every change. */
  function applyMapping(csv: string, next: LeadMapping) {
    setMapping(next)
    setParsed(parseLeadCsv(csv, next))
  }

  async function readFile(file: File) {
    setError(null)
    setDone(null)
    setFileName(file.name)
    try {
      const csv = await file.text()
      const columns = readHeadings(csv)
      if (columns.length === 0) {
        setError("No header row found. The first row should name the columns.")
        setParsed(null)
        return
      }
      const guess = suggestMapping(columns)
      const result = parseLeadCsv(csv, guess)
      if (result.leads.length === 0 && result.skipped.length === 0) {
        setError("No rows found under the header. Export the file again.")
        setParsed(null)
        return
      }
      setText(csv)
      setHeadings(columns)
      setMapping(guess)
      setParsed(result)
      // The campaign name is usually in the filename, which saves retyping it.
      if (!source) setSource(file.name.replace(/\.csv$/i, "").slice(0, 60))
    } catch {
      setError("That file could not be read. Export it again as CSV.")
      setParsed(null)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!firstStage}>
        <Upload className="mr-1.5 size-4" /> Import
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false)
            reset()
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import leads</DialogTitle>
            <DialogDescription>
              A CSV from Meta Ads, Google Forms or a spreadsheet. Name, email and phone are
              matched automatically; every other column is kept against the lead.
            </DialogDescription>
          </DialogHeader>

          {done ? (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-medium">{done.created}</span> lead
                {done.created === 1 ? "" : "s"} added
                {done.duplicates > 0 && (
                  <>
                    , <span className="font-medium">{done.duplicates}</span> skipped as already
                    here
                  </>
                )}
                .
              </p>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    reset()
                  }}
                >
                  Import another
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    reset()
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="import-file">CSV file</Label>
                <input
                  ref={fileRef}
                  id="import-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void readFile(file)
                  }}
                  className="w-full rounded-md border bg-transparent p-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {parsed && mapping && (
                <>
                  {/* The header row, offered back so each column can be put
                      where it belongs. The automatic match is only a first
                      guess: a lead form's headings are written by whoever
                      built the ad, and no list of aliases covers every way
                      someone writes "mobile". */}
                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Which column is which
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {LEAD_FIELDS.map((field) => (
                        <div key={field} className="space-y-1">
                          <Label htmlFor={`map-${field}`} className="text-xs">
                            {LEAD_FIELD_LABEL[field]}
                          </Label>
                          <select
                            id={`map-${field}`}
                            value={mapping[field] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              applyMapping(text, {
                                ...mapping,
                                [field]: value === "" ? null : Number(value),
                              })
                            }}
                            className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="">Not in this file</option>
                            {headings.map((heading, i) => (
                              <option key={`${heading}-${i}`} value={i}>
                                {heading || `Column ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Anything you leave unassigned is kept against the lead under its own
                      heading, so nothing in the file is lost.
                    </p>
                  </div>

                  <div className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {parsed.leads.length} lead{parsed.leads.length === 1 ? "" : "s"} ready
                      {parsed.skipped.length > 0 && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {parsed.skipped.length} will be skipped
                        </span>
                      )}
                    </p>
                    {parsed.extraColumns.length > 0 ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Kept against each lead: {parsed.extraColumns.join(", ")}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        No extra columns - just name, email and phone.
                      </p>
                    )}
                    {parsed.skipped.length > 0 && (
                      <p className="mt-1.5 text-xs text-tone-warning">
                        Rows {parsed.skipped.slice(0, 6).map((s) => s.line).join(", ")}
                        {parsed.skipped.length > 6 && "..."} have no email or phone, so there is
                        no way to follow them up.
                      </p>
                    )}
                    {parsed.unreadableDates > 0 && (
                      <p className="mt-1.5 text-xs text-tone-warning">
                        {parsed.unreadableDates} date
                        {parsed.unreadableDates === 1 ? "" : "s"} could not be read - those leads
                        import with today&rsquo;s date. Check the Date created column is the
                        right one.
                      </p>
                    )}
                  </div>

                  {parsed.leads[0] && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        First row, as it will be saved
                      </p>
                      <p className="mt-1.5 text-sm font-medium">{parsed.leads[0].name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          parsed.leads[0].email,
                          parsed.leads[0].phone,
                          parsed.leads[0].createdAt
                            ? parsed.leads[0].createdAt.toISOString().slice(0, 10)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {parsed.leads[0].description && (
                        <p className="mt-1.5 text-xs whitespace-pre-wrap text-muted-foreground">
                          {parsed.leads[0].description}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="import-source">Source</Label>
                      <Input
                        id="import-source"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder="Meta - Bakery campaign"
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown on each lead and in Leads by Source.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="import-stage">Add to column</Label>
                      <select
                        id="import-stage"
                        value={targetStage}
                        onChange={(e) => setStageId(e.target.value)}
                        className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {[...stages]
                          .sort((a, b) => a.position - b.position)
                          .map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOpen(false)
                    reset()
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending || !parsed || parsed.leads.length === 0 || !targetStage}
                  onClick={() => {
                    if (!parsed) return
                    setError(null)
                    startTransition(async () => {
                      try {
                        const result = await importLeads({
                          stageId: targetStage,
                          source: source || null,
                          rows: parsed.leads.map((lead) => ({
                            name: lead.name,
                            email: lead.email,
                            phone: lead.phone,
                            description: lead.description,
                            createdAt: lead.createdAt?.toISOString() ?? null,
                          })),
                        })
                        setDone(result)
                        router.refresh()
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : "Those could not be imported."
                        )
                      }
                    })
                  }}
                >
                  {pending
                    ? "Importing..."
                    : parsed
                      ? `Import ${parsed.leads.length}`
                      : "Choose a file"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <p className="sr-only" aria-live="polite">
        {fileName && `Selected ${fileName}`}
      </p>
    </>
  )
}
