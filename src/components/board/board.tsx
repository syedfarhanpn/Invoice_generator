"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CheckCircle2, Plus, X } from "lucide-react"

import { placeAt } from "@/lib/ordering"
import { cn } from "@/lib/utils"

/**
 * The board: ordered cards in named columns, dragged between them.
 *
 * Deliberately knows nothing about leads, projects or tasks. It is handed
 * columns and cards and hands back moves, which is what lets one
 * implementation serve all three panels and one stage editor configure them.
 *
 * Moves apply locally first and reconcile against the server afterwards. A
 * drag that has to wait for a round trip before the card lands reads as a
 * broken drag, so the optimistic state is the real state until the server
 * disagrees - at which point it snaps back and says so.
 */

export type BoardTone = "success" | "warning" | "info" | "danger" | "special" | "muted"

export type BoardBadge = { label: string; tone?: BoardTone }

export type BoardCard = {
  id: string
  stageId: string
  title: string
  /** The one line of context under the title, usually who it is for. */
  subtitle?: string | null
  badges?: BoardBadge[]
  /** Draws the check the reference puts on closed cards. */
  done?: boolean
}

export type BoardColumn = {
  id: string
  name: string
  type: "OPEN" | "WON" | "LOST"
}

const TONE_CLASS: Record<BoardTone, string> = {
  success: "bg-tone-success-bg text-tone-success",
  warning: "bg-tone-warning-bg text-tone-warning",
  info: "bg-tone-info-bg text-tone-info",
  danger: "bg-tone-danger-bg text-tone-danger",
  special: "bg-tone-special-bg text-tone-special",
  muted: "bg-muted text-muted-foreground",
}

function Badge({ badge }: { badge: BoardBadge }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        TONE_CLASS[badge.tone ?? "muted"]
      )}
    >
      {badge.label}
    </span>
  )
}

function CardBody({ card, dragging }: { card: BoardCard; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-2.5 text-left shadow-xs transition-colors",
        dragging ? "opacity-90 shadow-lg" : "hover:border-muted-foreground/30"
      )}
    >
      <div className="flex items-start gap-2">
        {card.done && (
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-tone-success"
            strokeWidth={2}
            aria-label="Closed"
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 text-sm break-words",
            card.done ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {card.title}
        </span>
      </div>

      {card.subtitle && (
        <div className="mt-1 truncate text-xs text-muted-foreground">{card.subtitle}</div>
      )}

      {card.badges && card.badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.badges.map((badge, i) => (
            <Badge key={`${badge.label}-${i}`} badge={badge} />
          ))}
        </div>
      )}
    </div>
  )
}

function SortableCard({ card, onOpen }: { card: BoardCard; onOpen?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.(card.id)}
      className={cn(
        "cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-40"
      )}
    >
      <CardBody card={card} />
    </div>
  )
}

/** Inline composer. Opens in place rather than in a dialog: adding a card is
 *  a one-field action and a modal for one field is ceremony. */
function AddCard({ onAdd, label }: { onAdd: (title: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const submit = () => {
    const title = value.trim()
    if (!title) return
    onAdd(title)
    setValue("")
    // Stays open: adding cards is usually adding several.
    inputRef.current?.focus()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" strokeWidth={2} />
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-1.5">
      <textarea
        ref={inputRef}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          } else if (e.key === "Escape") {
            setOpen(false)
            setValue("")
          }
        }}
        placeholder="Type a title, then Enter"
        aria-label="New card title"
        className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={submit}
          className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setValue("")
          }}
          aria-label="Cancel"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

function Column({
  column,
  cards,
  onAdd,
  onOpen,
  addLabel,
}: {
  column: BoardColumn
  cards: BoardCard[]
  onAdd: (stageId: string, title: string) => void
  onOpen?: (id: string) => void
  addLabel: string
}) {
  // Droppable in its own right, so an empty column is still a target.
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` })

  return (
    <section
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        isOver && "border-ring/60 bg-accent/40"
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h3 className="truncate text-sm font-semibold">{column.name}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{cards.length}</span>
      </header>

      <div ref={setNodeRef} className="flex min-h-2 flex-1 flex-col gap-2 px-2 pb-1">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>

      <div className="p-2 pt-1">
        <AddCard label={addLabel} onAdd={(title) => onAdd(column.id, title)} />
      </div>
    </section>
  )
}

export function Board({
  columns,
  cards,
  onMove,
  onCreate,
  onOpen,
  addLabel = "Add a card",
}: {
  columns: BoardColumn[]
  cards: BoardCard[]
  onMove: (cardId: string, toStageId: string, toIndex: number) => Promise<void>
  onCreate: (stageId: string, title: string) => Promise<void>
  onOpen?: (id: string) => void
  addLabel?: string
}) {
  const [items, setItems] = useState(cards)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // What the board looked like before the drag, so a rejected move can snap
  // back to exactly where it started rather than to whatever arrived since.
  const beforeDrag = useRef<BoardCard[]>(cards)

  // Server data wins whenever it changes and we are not mid-drag.
  useEffect(() => {
    if (!activeId) setItems(cards)
  }, [cards, activeId])

  const sensors = useSensors(
    // A small distance so a click to open a card is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardCard[]>()
    for (const column of columns) map.set(column.id, [])
    for (const card of items) map.get(card.stageId)?.push(card)
    return map
  }, [columns, items])

  const activeCard = activeId ? items.find((c) => c.id === activeId) ?? null : null

  /** Which column a drag is currently over, whether it is over a card or the
   *  column's own empty space. */
  const columnOf = (id: string): string | null => {
    if (id.startsWith("column:")) return id.slice("column:".length)
    return items.find((c) => c.id === id)?.stageId ?? null
  }

  const handleDragStart = (event: DragStartEvent) => {
    beforeDrag.current = items
    setActiveId(String(event.active.id))
    setError(null)
  }

  // Moves the card across columns while still dragging, so the card follows
  // the cursor into its new column instead of jumping on release.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const activeCardId = String(active.id)
    const overColumn = columnOf(String(over.id))
    if (!overColumn) return

    setItems((current) => {
      const card = current.find((c) => c.id === activeCardId)
      if (!card || card.stageId === overColumn) return current
      return current.map((c) => (c.id === activeCardId ? { ...c, stageId: overColumn } : c))
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) {
      setItems(beforeDrag.current)
      return
    }

    const cardId = String(active.id)
    const toStageId = columnOf(String(over.id))
    if (!toStageId) {
      setItems(beforeDrag.current)
      return
    }

    // Where in the column it landed: above the card it was dropped on, or at
    // the end when dropped on the column itself.
    const target = byColumn.get(toStageId) ?? []
    const overId = String(over.id)
    const overIndex = target.findIndex((c) => c.id === overId)
    const toIndex = overIndex >= 0 ? overIndex : target.length

    const reordered = reorderLocally(items, cardId, toStageId, toIndex)
    setItems(reordered)

    try {
      await onMove(cardId, toStageId, toIndex)
    } catch {
      setItems(beforeDrag.current)
      setError("That move did not save. The card has been put back.")
    }
  }

  const handleCreate = async (stageId: string, title: string) => {
    // No optimistic card: it has no id until the server gives it one, and a
    // card that cannot be dragged for a moment is worse than one that appears
    // a moment later.
    try {
      await onCreate(stageId, title)
    } catch {
      setError("That card could not be added.")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger"
        >
          {error}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setItems(beforeDrag.current)
          setActiveId(null)
        }}
      >
        <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4">
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={byColumn.get(column.id) ?? []}
              onAdd={handleCreate}
              onOpen={onOpen}
              addLabel={addLabel}
            />
          ))}

          {columns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This board has no columns yet. Add some in Preferences.
            </p>
          )}
        </div>

        {/* Follows the cursor at full opacity while the original sits faded. */}
        <DragOverlay>{activeCard && <CardBody card={activeCard} dragging />}</DragOverlay>
      </DndContext>
    </div>
  )
}

/**
 * The same move the server will make, applied here first.
 *
 * Both sides call placeAt() so the card cannot land in one place optimistically
 * and a different one once the write returns.
 */
function reorderLocally(
  cards: BoardCard[],
  cardId: string,
  toStageId: string,
  toIndex: number
): BoardCard[] {
  const moving = cards.find((c) => c.id === cardId)
  if (!moving) return cards

  const others = cards.filter((c) => c.id !== cardId)
  const target = placeAt(
    [...others.filter((c) => c.stageId === toStageId), { ...moving, stageId: toStageId }],
    cardId,
    toIndex
  )

  // Rebuild preserving the order of every other column.
  return [...others.filter((c) => c.stageId !== toStageId), ...target]
}
