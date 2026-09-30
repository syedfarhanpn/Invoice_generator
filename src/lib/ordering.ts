/**
 * Where a dragged card lands.
 *
 * Pure and dependency-free on purpose: the board computes this on the client
 * to place the card immediately, and the server computes it again to write the
 * positions. Two implementations of the same rule would eventually disagree,
 * and the symptom would be a card that jumps after you drop it.
 */

/**
 * Removes `movedId` and reinserts it at `toIndex`.
 *
 * `toIndex` counts positions in the list *without* the moved item, which is
 * what a drop target describes: "above the card currently third" is index 2
 * whether or not the dragged card used to sit above it. Out-of-range indices
 * clamp rather than throw - a drop past the end of a column is a real gesture
 * and means "last".
 */
export function placeAt<T extends { id: string }>(
  items: T[],
  movedId: string,
  toIndex: number
): T[] {
  const moved = items.find((item) => item.id === movedId)
  const rest = items.filter((item) => item.id !== movedId)
  if (!moved) return rest

  const clamped = Math.max(0, Math.min(toIndex, rest.length))
  rest.splice(clamped, 0, moved)
  return rest
}

/** The same move, expressed as the positions to write. */
export function positionsAfterMove<T extends { id: string }>(
  items: T[],
  movedId: string,
  toIndex: number
): { id: string; position: number }[] {
  return placeAt(items, movedId, toIndex).map((item, index) => ({
    id: item.id,
    position: index,
  }))
}

/** Positions for a column nothing moved into - just closing any gaps. */
export function compactPositions<T extends { id: string }>(
  items: T[]
): { id: string; position: number }[] {
  return items.map((item, index) => ({ id: item.id, position: index }))
}
