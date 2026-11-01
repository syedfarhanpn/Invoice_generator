"use client"

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react"
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

import { leadingTotal, summarizeValues, type ValueSummary } from "@/lib/board-totals"
import { formatAmount, formatCompactAmount } from "@/lib/format-compact"
import { placeAt } from "@/lib/ordering"
import { cn } from "@/lib/utils"

/**
 * The board: ordered cards in named columns, dragged between them.
 *
 * Deliberately knows nothing about leads, projects or tasks. It is handed
 * columns and cards and hands back moves, which is what lets one
 * implementation serve all three panels and one stage editor configure them.
 *
 * Moves and additions both apply locally first and reconcile against the
 * server afterwards. A drag that has to wait for a round trip before the card
 * lands reads as a broken drag, and a title typed into the composer that sits
 * there doing nothing reads as a dropped keystroke - so the optimistic state
 * is the real state until the server disagrees, at which point it snaps back
 * and says so.
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
  /**
   * A card shown before the server has acknowledged it.
   *
   * It has no real id yet, so it cannot be dragged or opened - it sits in
   * place, dimmed, until the write comes back and the server's own card
   * takes over.
   */
  pending?: boolean
  /** What the card is worth, when the board totals money. Absent = unpriced. */
  value?: number | null
  currency?: string | null
}

export type BoardColumn = {
  id: string
  name: string
  type: "OPEN" | "WON" | "LOST"
  /** A line under the heading, for a column that behaves unusually - the
   *  Completed column clearing each Sunday, say. */
  note?: string | null
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
      aria-busy={card.pending || undefined}
      className={cn(
        "rounded-lg border bg-card px-3 py-2.5 text-left shadow-xs transition-colors",
        dragging ? "opacity-90 shadow-lg" : "hover:border-muted-foreground/30",
        // Dimmed rather than spinner-ed: the card is already readable and
        // already in the right place, and the only thing still outstanding
        // is the id. A spinner would imply more doubt than there is.
        card.pending && "opacity-60"
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

      {/* Its own line rather than one more grey tag: on a board that totals
          money, what each card is worth is the second thing you read. */}
      {card.value != null && card.value > 0 && card.currency && (
        <div
          className={cn(
            "mt-1 text-sm font-semibold tabular-nums",
            card.done ? "text-tone-success" : "text-foreground"
          )}
        >
          {formatAmount(card.value, card.currency)}
        </div>
      )}

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

/**
 * A money total, abbreviated to fit a column header, in full on hover.
 *
 * Says how many cards actually carried a value whenever that is not all of
 * them, so a total over a half-priced column is read as a floor.
 */
function TotalLine({
  summary,
  currency,
  className,
}: {
  summary: ValueSummary
  currency: string
  className?: string
}) {
  const lead = leadingTotal(summary, currency)
  const others = summary.totals.slice(1)
  const partial = summary.valued < summary.count

  const full =
    (summary.totals.length > 0
      ? summary.totals.map((t) => formatAmount(t.amount, t.currency)).join(" + ")
      : formatAmount(0, lead.currency)) +
    ` from ${summary.valued} of ${summary.count} with a value`

  return (
    <p className={cn("text-xs tabular-nums", className)} title={full}>
      <span className="font-semibold text-foreground">
        {formatCompactAmount(lead.amount, lead.currency)}
      </span>
      {others.map((t) => (
        <span key={t.currency} className="font-semibold text-foreground">
          {" + "}
          {formatCompactAmount(t.amount, t.currency)}
        </span>
      ))}
      {partial && (
        <span className="text-muted-foreground">
          {" "}
          · {summary.valued} of {summary.count} have a value
        </span>
      )}
    </p>
  )
}

function Column({
  column,
  cards,
  onAdd,
  onRequestAdd,
  onOpen,
  addLabel,
  totalsCurrency,
}: {
  column: BoardColumn
  cards: BoardCard[]
  onAdd: (stageId: string, title: string) => void
  /** When given, adding opens the caller's own form instead of the inline
   *  one-line input. */
  onRequestAdd?: (stageId: string) => void
  onOpen?: (id: string) => void
  addLabel: string
  /** Set when the board totals money; the currency to total in. */
  totalsCurrency?: string
}) {
  // Droppable in its own right, so an empty column is still a target.
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` })

  // A card still being written is drawn after the sortable list and outside
  // it: dnd-kit would otherwise register a temporary id as a drop target, and
  // dropping onto a card that is about to be replaced has nowhere to land.
  const placed = cards.filter((c) => !c.pending)
  const saving = cards.filter((c) => c.pending)

  // Over the placed cards: one still saving has no value yet and would only
  // drag the "n of m have a value" count down for a second.
  const summary = totalsCurrency ? summarizeValues(placed, totalsCurrency) : null

  return (
    <section
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        isOver && "border-ring/60 bg-accent/40"
      )}
    >
      <header className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{column.name}</h3>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {cards.length}
          </span>
        </div>
        {summary && totalsCurrency && summary.count > 0 && (
          <TotalLine summary={summary} currency={totalsCurrency} className="mt-0.5" />
        )}
        {column.note && <p className="mt-0.5 text-xs text-muted-foreground">{column.note}</p>}
      </header>

      <div ref={setNodeRef} className="flex min-h-2 flex-1 flex-col gap-2 px-2 pb-1">
        <SortableContext items={placed.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {placed.map((card) => (
            <SortableCard key={card.id} card={card} onOpen={onOpen} />
          ))}
        </SortableContext>

        {saving.map((card) => (
          <div key={card.id} className="cursor-default">
            <CardBody card={card} />
          </div>
        ))}
      </div>

      <div className="p-2 pt-1">
        {onRequestAdd ? (
          // The caller wants its own form - a project needs a client, a
          // manager and dates, which is more than a one-line input can take.
          <button
            type="button"
            onClick={() => onRequestAdd(column.id)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4" strokeWidth={2} />
            {addLabel}
          </button>
        ) : (
          <AddCard label={addLabel} onAdd={(title) => onAdd(column.id, title)} />
        )}
      </div>
    </section>
  )
}

export function Board({
  columns,
  cards,
  onMove,
  onCreate,
  onRequestCreate,
  onOpen,
  addLabel = "Add a card",
  totals,
}: {
  columns: BoardColumn[]
  cards: BoardCard[]
  onMove: (cardId: string, toStageId: string, toIndex: number) => Promise<void>
  onCreate: (stageId: string, title: string) => Promise<void>
  /** When given, the add control defers to the caller instead of the inline
   *  one-line input - for a card that needs a real form. */
  onRequestCreate?: (stageId: string) => void
  onOpen?: (id: string) => void
  addLabel?: string
  /**
   * Turns on money totals: each column's in its header, and the open and won
   * figures across the whole board above it. Off unless asked for - a task
   * board has nothing to add up.
   */
  totals?: { currency: string }
}) {
  const [items, setItems] = useState(cards)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // What the board looked like before the drag, so a rejected move can snap
  // back to exactly where it started rather than to whatever arrived since.
  const beforeDrag = useRef<BoardCard[]>(cards)

  // Server data wins whenever it changes and we are not mid-drag.
  //
  // Adjusted during render rather than in an effect. Syncing props into state
  // from an effect renders the stale list first and corrects it on a second
  // pass, which is a visible flicker on every revalidation as well as the
  // cascading render the lint rule warns about. Comparing against the last
  // props we accepted makes this run once per actual change.
  const [lastCards, setLastCards] = useState(cards)
  if (cards !== lastCards && !activeId) {
    setLastCards(cards)
    setItems(cards)
  }

  /**
   * Cards typed into a composer but not yet acknowledged.
   *
   * useOptimistic rather than a second piece of state, because React already
   * knows when to let go of it: the card survives exactly as long as the
   * transition that created it, which covers the write AND the re-render that
   * arrives with the server's own copy. Hand-rolled bookkeeping would have to
   * guess when to drop it, and guessing early flickers while guessing late
   * shows the card twice.
   */
  const [optimisticItems, addOptimisticCard] = useOptimistic(
    items,
    (current: BoardCard[], added: BoardCard) => [...current, added]
  )
  const [, startTransition] = useTransition()
  // Only has to be unique among cards on screen, and only until the real id
  // lands. A counter says that more plainly than a uuid would.
  const pendingSeq = useRef(0)

  const sensors = useSensors(
    // A small distance so a click to open a card is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardCard[]>()
    for (const column of columns) map.set(column.id, [])
    for (const card of optimisticItems) map.get(card.stageId)?.push(card)
    return map
  }, [columns, optimisticItems])

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
    // the end when dropped on the column itself. Counted over the real cards
    // only - a card still saving holds no position the server knows about,
    // and counting it would file this one index too far down.
    const target = (byColumn.get(toStageId) ?? []).filter((c) => !c.pending)
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

  const handleCreate = (stageId: string, title: string) => {
    setError(null)
    // Inside a transition because that is what gives the optimistic card its
    // lifetime: React keeps it until everything awaited here has finished,
    // including the re-render the revalidation triggers.
    startTransition(async () => {
      addOptimisticCard({
        id: `pending:${pendingSeq.current++}`,
        stageId,
        title,
        pending: true,
      })
      try {
        await onCreate(stageId, title)
      } catch {
        // The optimistic card is dropped when the transition ends, so a
        // failure takes the card away with it and leaves only this.
        setError("That card could not be added.")
      }
    })
  }

  // The board-wide figures, from the same optimistic list the columns draw,
  // so a drag moves the money between the totals the moment the card lands.
  // Lost is left out of the headline: money a prospect walked away with is
  // not pipeline, and adding it would flatter the board. Its own column
  // header still shows it.
  const totalsCurrency = totals?.currency
  const boardTotals = useMemo(() => {
    if (!totalsCurrency) return null
    const typeOf = new Map(columns.map((c) => [c.id, c.type]))
    const placed = optimisticItems.filter((c) => !c.pending)
    return {
      open: summarizeValues(
        placed.filter((c) => typeOf.get(c.stageId) === "OPEN"),
        totalsCurrency
      ),
      won: summarizeValues(
        placed.filter((c) => typeOf.get(c.stageId) === "WON"),
        totalsCurrency
      ),
    }
  }, [totalsCurrency, columns, optimisticItems])

  return (
    <div className="flex flex-col">
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger"
        >
          {error}
        </div>
      )}

      {boardTotals && totalsCurrency && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground">Open pipeline</span>
            <TotalLine summary={boardTotals.open} currency={totalsCurrency} className="text-sm" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground">Won</span>
            <TotalLine summary={boardTotals.won} currency={totalsCurrency} className="text-sm" />
          </div>
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
        {/* A floor so an empty board is still a drop target, and room to
            grow so columns are never clipped. */}
        <div className="flex min-h-96 items-start gap-3 overflow-x-auto p-4">
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={byColumn.get(column.id) ?? []}
              onAdd={handleCreate}
              onRequestAdd={onRequestCreate}
              onOpen={onOpen}
              addLabel={addLabel}
              totalsCurrency={totalsCurrency}
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
