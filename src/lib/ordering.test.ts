import { describe, expect, it } from "vitest"

import { compactPositions, placeAt, positionsAfterMove } from "./ordering"

const list = (...ids: string[]) => ids.map((id) => ({ id }))
const ids = (items: { id: string }[]) => items.map((item) => item.id)

describe("placeAt", () => {
  it("moves a card down its own column", () => {
    expect(ids(placeAt(list("a", "b", "c", "d"), "a", 2))).toEqual(["b", "c", "a", "d"])
  })

  it("moves a card up its own column", () => {
    expect(ids(placeAt(list("a", "b", "c", "d"), "d", 1))).toEqual(["a", "d", "b", "c"])
  })

  it("treats the index as a position in the list without the moved card", () => {
    // The original bug this guards: counting the dragged card itself makes
    // every downward move land one slot short.
    expect(ids(placeAt(list("a", "b", "c"), "a", 1))).toEqual(["b", "a", "c"])
  })

  it("inserts a card arriving from another column", () => {
    expect(ids(placeAt(list("a", "b"), "new", 1))).toEqual(["a", "b"])
    expect(ids(placeAt([...list("a", "b"), { id: "new" }], "new", 1))).toEqual(["a", "new", "b"])
  })

  it("clamps a drop past the end to last", () => {
    expect(ids(placeAt(list("a", "b", "c"), "a", 99))).toEqual(["b", "c", "a"])
  })

  it("clamps a negative index to first", () => {
    expect(ids(placeAt(list("a", "b", "c"), "c", -5))).toEqual(["c", "a", "b"])
  })

  it("leaves the order alone when the card lands where it already was", () => {
    expect(ids(placeAt(list("a", "b", "c"), "b", 1))).toEqual(["a", "b", "c"])
  })

  it("drops an unknown id rather than inventing a card", () => {
    expect(ids(placeAt(list("a", "b"), "ghost", 0))).toEqual(["a", "b"])
  })

  it("handles a single-card column", () => {
    expect(ids(placeAt(list("a"), "a", 0))).toEqual(["a"])
  })

  it("does not mutate its input", () => {
    const original = list("a", "b", "c")
    placeAt(original, "a", 2)
    expect(ids(original)).toEqual(["a", "b", "c"])
  })
})

describe("positionsAfterMove", () => {
  it("numbers from zero with no gaps", () => {
    expect(positionsAfterMove(list("a", "b", "c"), "c", 0)).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ])
  })

  it("renumbers every card, not only the ones that shifted", () => {
    // Positions arriving sparse (0, 5, 9) must come back dense.
    const result = positionsAfterMove(list("a", "b", "c"), "a", 1)
    expect(result.map((r) => r.position)).toEqual([0, 1, 2])
  })
})

describe("compactPositions", () => {
  it("closes the gap a departing card left behind", () => {
    expect(compactPositions(list("a", "c"))).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
    ])
  })

  it("returns nothing for an emptied column", () => {
    expect(compactPositions([])).toEqual([])
  })
})
