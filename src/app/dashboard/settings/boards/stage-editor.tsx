"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { addStage, deleteStage, moveStage, renameStage, setStageType } from "./actions"

/**
 * The stage editor for one board.
 *
 * Renames commit on blur rather than behind a save button, because a column
 * name is one field and a form around one field is ceremony. Everything else
 * is a single click. Failures surface in place and leave the row as it was -
 * the server is the source of truth and the screen re-reads it.
 */

export type EditableStage = {
  id: string
  name: string
  position: number
  type: "OPEN" | "WON" | "LOST"
  /** How many cards sit in this column, so delete can explain itself. */
  count: number
}

const TYPE_HINT: Record<EditableStage["type"], string> = {
  OPEN: "In progress",
  WON: "Closes as done",
  LOST: "Closes as dropped",
}

export function StageEditor({
  kind,
  title,
  description,
  stages,
}: {
  kind: string
  title: string
  description: string
  stages: EditableStage[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<EditableStage["type"]>("OPEN")
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That change did not save.")
      }
    })
  }

  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-5 py-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="divide-y">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
            <Input
              defaultValue={stage.name}
              aria-label={`Column name: ${stage.name}`}
              onBlur={(e) => {
                const value = e.target.value.trim()
                if (value && value !== stage.name) run(() => renameStage(stage.id, value))
              }}
              className="h-9 w-full sm:w-52"
            />

            <select
              value={stage.type}
              aria-label={`Behaviour of ${stage.name}`}
              onChange={(e) => run(() => setStageType(stage.id, e.target.value))}
              className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(["OPEN", "WON", "LOST"] as const).map((type) => (
                <option key={type} value={type}>
                  {TYPE_HINT[type]}
                </option>
              ))}
            </select>

            <span className="text-xs tabular-nums text-muted-foreground">
              {stage.count} {stage.count === 1 ? "card" : "cards"}
            </span>

            <div className="ml-auto flex items-center gap-1">
              <IconButton
                label={`Move ${stage.name} earlier`}
                disabled={index === 0 || pending}
                onClick={() => run(() => moveStage(stage.id, "up"))}
              >
                <ChevronUp className="size-4" />
              </IconButton>
              <IconButton
                label={`Move ${stage.name} later`}
                disabled={index === stages.length - 1 || pending}
                onClick={() => run(() => moveStage(stage.id, "down"))}
              >
                <ChevronDown className="size-4" />
              </IconButton>
              <IconButton
                label={`Delete ${stage.name}`}
                disabled={pending}
                destructive
                onClick={() => run(() => deleteStage(stage.id))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>
        ))}

        {stages.length === 0 && (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            No columns yet. Add the first one below.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              e.preventDefault()
              run(async () => {
                await addStage(kind, newName, newType)
                setNewName("")
              })
            }
          }}
          placeholder="New column name"
          aria-label="New column name"
          className="h-9 w-full sm:w-52"
        />
        <select
          value={newType}
          aria-label="New column behaviour"
          onChange={(e) => setNewType(e.target.value as EditableStage["type"])}
          className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {(["OPEN", "WON", "LOST"] as const).map((type) => (
            <option key={type} value={type}>
              {TYPE_HINT[type]}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={!newName.trim() || pending}
          onClick={() =>
            run(async () => {
              await addStage(kind, newName, newType)
              setNewName("")
            })
          }
        >
          <Plus className="mr-1.5 size-4" /> Add column
        </Button>
      </div>

      {error && (
        <p role="alert" className="border-t px-5 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors",
        "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40",
        destructive && "hover:bg-tone-danger-bg hover:text-tone-danger"
      )}
    >
      {children}
    </button>
  )
}
