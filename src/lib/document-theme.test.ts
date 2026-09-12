import { describe, expect, it } from "vitest"

import {
  DEFAULT_DOCUMENT_FONT,
  DEFAULT_PAPER_COLOR,
  documentCssVars,
  documentFontCss,
  documentFontPdf,
  documentPalette,
  PAPER_PRESETS,
  parseDocumentFont,
  parsePaperColor,
} from "./document-theme"

describe("documentPalette", () => {
  it("reproduces the original white-paper palette exactly", () => {
    // These are the hex values the invoice PDF and preview were built with.
    // If this breaks, every existing document changed appearance.
    const p = documentPalette("#ffffff")
    expect(p).toMatchObject({
      paper: "#ffffff",
      ink: "#0a0a0a",
      muted: "#737373",
      rowBorder: "#fafafa",
      headBorder: "#f5f5f5",
      bandBg: "#fdfdfd",
      bandBorder: "#f9f9f9",
      draftMark: "#f2f2f2",
      pageNumber: "#b3b3b3",
      isDark: false,
    })
  })

  it("uses the white-paper palette when nothing is configured", () => {
    expect(documentPalette(null)).toEqual(documentPalette("#ffffff"))
    expect(documentPalette(undefined)).toEqual(documentPalette(DEFAULT_PAPER_COLOR))
  })

  it("flips to light ink on dark paper", () => {
    const dark = documentPalette("#1c1c1e")
    expect(dark.isDark).toBe(true)
    expect(dark.ink).toBe("#f7f7f7")
    // Rules and bands sit just off the paper, not near-white as on white paper.
    expect(dark.rowBorder).toBe("#202022")
    expect(dark.bandBg).toBe("#1e1e20")
  })

  it("keeps dark ink on a tinted but still light paper", () => {
    for (const paper of ["#fbf8f1", "#f4f4f5", "#e8e0cc"]) {
      expect(documentPalette(paper).ink).toBe("#0a0a0a")
    }
  })

  it("always separates ink from paper", () => {
    // Any paper the picker can produce must stay readable.
    for (const paper of ["#000000", "#ffffff", "#808080", "#123456", "#ffee00"]) {
      const p = documentPalette(paper)
      expect(p.ink).not.toBe(p.paper)
      expect(p.muted).not.toBe(p.paper)
    }
  })
})

describe("parsePaperColor", () => {
  it("accepts six and three digit hex", () => {
    expect(parsePaperColor("#FBF8F1")).toBe("#fbf8f1")
    expect(parsePaperColor("  #ABC  ")).toBe("#aabbcc")
  })

  it("always normalises to lowercase", () => {
    // <input type="color"> resets any value that is not a lowercase "valid
    // simple color" to #000000, so an uppercase paper would show as black.
    for (const value of ["#FFFFFF", "#FbF8F1", "#ABC", ...PAPER_PRESETS.map((p) => p.value)]) {
      expect(parsePaperColor(value)).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(DEFAULT_PAPER_COLOR).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("rejects anything that is not a hex colour", () => {
    // The value is written into inline styles and into the PDF, so a stray
    // string must never be passed through.
    for (const bad of [
      undefined, null, 42, "", "white", "rgb(0,0,0)", "#12345",
      "#ffffff; background: url(x)", "javascript:alert(1)",
    ]) {
      expect(parsePaperColor(bad)).toBe(DEFAULT_PAPER_COLOR)
    }
  })
})

describe("fonts", () => {
  it("falls back to the default for anything unrecognised", () => {
    for (const bad of [undefined, null, "", "comic", "Tinos", 1]) {
      expect(parseDocumentFont(bad)).toBe(DEFAULT_DOCUMENT_FONT)
    }
  })

  it("maps each choice to a browser stack and a registered PDF family", () => {
    expect(documentFontPdf("serif")).toBe("Tinos")
    expect(documentFontPdf("sans")).toBe("Geist")
    expect(documentFontCss("serif")).toContain("Times New Roman")
    expect(documentFontCss("sans")).toContain("--font-geist-sans")
  })

  it("defaults to the serif the documents already used", () => {
    expect(DEFAULT_DOCUMENT_FONT).toBe("serif")
    expect(documentFontPdf(undefined)).toBe("Tinos")
  })
})

describe("documentCssVars", () => {
  it("re-points the theme tokens at the paper", () => {
    const vars = documentCssVars(documentPalette("#ffffff"))
    expect(vars["--background"]).toBe("#ffffff")
    expect(vars["--foreground"]).toBe("#0a0a0a")
    expect(vars["--muted-foreground"]).toBe("#737373")
    expect(vars.colorScheme).toBe("light")
  })

  it("tells the browser to render native widgets dark on dark paper", () => {
    expect(documentCssVars(documentPalette("#1c1c1e")).colorScheme).toBe("dark")
  })
})
