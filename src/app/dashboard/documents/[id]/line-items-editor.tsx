"use client"

import { useId } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import type { InvoiceLineItem } from "@/lib/types"

/**
 * A line item plus a client-only row id.
 *
 * The id never reaches the database: Document.content keeps its
 * {description, qty, rate} shape, so nothing about the stored document, the
 * preview or the PDF changes. It exists because reordering needs a stable
 * identity - keying rows by array index makes React reuse the wrong input
 * when two rows swap, so text would appear to jump between lines.
 */
export type EditableLine = InvoiceLineItem & { _rowId: string }

let rowCounter = 0
export function newRowId(): string {
  rowCounter += 1
  return `line-${rowCounter}-${Math.random().toString(36).slice(2, 8)}`
}

export function withRowIds(items: InvoiceLineItem[] | undefined): EditableLine[] {
  const source = items?.length ? items : [{ description: "", qty: 1, rate: 0 }]
  return source.map((item) => ({ ...item, _rowId: newRowId() }))
}

/** Strips the client-only id before the items are saved or previewed. */
export function stripRowIds(items: EditableLine[]): InvoiceLineItem[] {
  return items.map((item) => ({
    description: item.description,
    qty: item.qty,
    rate: item.rate,
  }))
}

export function LineItemsEditor({
  items,
  currency,
  isDraft,
  onChange,
}: {
  items: EditableLine[]
  currency: string
  isDraft: boolean
  onChange: (items: EditableLine[]) => void
}) {
  // Namespaces the dnd ids so a second list on the page could never collide.
  const contextId = useId()

  const sensors = useSensors(
    // A small distance threshold means a plain click on an input still focuses
    // it instead of starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i._rowId === active.id)
    const to = items.findIndex((i) => i._rowId === over.id)
    if (from === -1 || to === -1) return
    onChange(arrayMove(items, from, to))
  }

  function update(rowId: string, patch: Partial<InvoiceLineItem>) {
    onChange(items.map((item) => (item._rowId === rowId ? { ...item, ...patch } : item)))
  }

  function remove(rowId: string) {
    onChange(items.filter((item) => item._rowId !== rowId))
  }

  function add() {
    onChange([...items, { description: "", qty: 1, rate: 0, _rowId: newRowId() }])
  }

  return (
    <>
      <DndContext
        id={contextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        // Rows only move up and down, and never outside the list.
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up line item ${indexOf(items, active.id)}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `Line item ${indexOf(items, active.id)} moved over position ${indexOf(items, over.id)}.`
                : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? `Line item dropped at position ${indexOf(items, over.id)}.`
                : `Line item ${indexOf(items, active.id)} returned to its position.`,
            onDragCancel: ({ active }) =>
              `Move cancelled. Line item ${indexOf(items, active.id)} stayed where it was.`,
          },
        }}
      >
        <SortableContext
          items={items.map((i) => i._rowId)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item, index) => (
            <SortableLine
              key={item._rowId}
              item={item}
              index={index}
              total={items.length}
              currency={currency}
              isDraft={isDraft}
              onUpdate={update}
              onRemove={remove}
            />
          ))}
        </SortableContext>
      </DndContext>

      {isDraft && (
        <Button type="button" variant="outline" className="w-full text-xs" onClick={add}>
          <Plus className="w-3 h-3 mr-2" /> Add Item
        </Button>
      )}
    </>
  )
}

function indexOf(items: EditableLine[], id: string | number): number {
  return items.findIndex((i) => i._rowId === id) + 1
}

function SortableLine({
  item,
  index,
  total,
  currency,
  isDraft,
  onUpdate,
  onRemove,
}: {
  item: EditableLine
  index: number
  total: number
  currency: string
  isDraft: boolean
  onUpdate: (rowId: string, patch: Partial<InvoiceLineItem>) => void
  onRemove: (rowId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._rowId,
    disabled: !isDraft,
  })

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative p-3", isDragging && "z-10 shadow-lg ring-2 ring-foreground/20")}
    >
      {isDraft && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5">
          {/* Only the handle starts a drag, so the inputs stay usable. */}
          <button
            type="button"
            aria-label={`Reorder line item ${index + 1} of ${total}`}
            title="Drag to reorder, or focus and use the arrow keys"
            className="cursor-grab touch-none rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove line item ${index + 1}`}
            title="Remove this line"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(item._rowId)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Input
            value={item.description}
            onChange={(e) => onUpdate(item._rowId, { description: e.target.value })}
            disabled={!isDraft}
            className="h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              value={item.qty}
              onChange={(e) => onUpdate(item._rowId, { qty: parseFloat(e.target.value) || 0 })}
              // Without this, typing into a field showing 0 appends ("07").
              onFocus={(e) => e.target.select()}
              disabled={!isDraft}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rate</Label>
            <Input
              type="number"
              step="0.01"
              value={item.rate}
              onChange={(e) => onUpdate(item._rowId, { rate: parseFloat(e.target.value) || 0 })}
              onFocus={(e) => e.target.select()}
              disabled={!isDraft}
              className="h-8 text-sm"
            />
          </div>
          <div className="text-sm text-right font-medium pb-1.5">
            {formatMoney((item.qty || 0) * (item.rate || 0), currency)}
          </div>
        </div>
      </div>
    </Card>
  )
}
