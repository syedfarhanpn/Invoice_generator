/**
 * How a generated document looks: the paper it is printed on and the typeface
 * it is set in.
 *
 * The preview and the PDF used to hard-code their colours separately, which
 * meant the on-screen document followed the app's dark mode while the PDF
 * stayed white - so a signature drawn in black ink vanished on screen. Both
 * now derive every colour from the same paper here, so what the editor shows
 * is what the client receives.
 *
 * Every derived value is a ratio measured off the original white-paper design:
 * with the default #FFFFFF paper this reproduces the previous palette exactly
 * (see document-theme.test.ts), so existing documents are unchanged.
 */

export type DocumentFont = "serif" | "sans"

export const DOCUMENT_FONTS: {
  value: DocumentFont
  label: string
  /** Browser stack. Tinos is metrically identical to Times New Roman. */
  css: string
  /** Family registered with react-pdf; both ship a rupee glyph. */
  pdf: "Tinos" | "Geist"
}[] = [
  {
    value: "serif",
    label: "Serif - classic, print-like",
    css: '"Tinos", "Times New Roman", Times, serif',
    pdf: "Tinos",
  },
  {
    value: "sans",
    label: "Sans - modern, geometric",
    css: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    pdf: "Geist",
  },
]

export const DEFAULT_DOCUMENT_FONT: DocumentFont = "serif"
export const DEFAULT_PAPER_COLOR = "#ffffff"

/** A few sane papers, offered alongside the free colour picker. */
export const PAPER_PRESETS: { label: string; value: string }[] = [
  { label: "White", value: "#ffffff" },
  { label: "Ivory", value: "#fbf8f1" },
  { label: "Cool grey", value: "#f4f4f5" },
  { label: "Charcoal", value: "#1c1c1e" },
]

export function parseDocumentFont(value: unknown): DocumentFont {
  return DOCUMENT_FONTS.some((f) => f.value === value)
    ? (value as DocumentFont)
    : DEFAULT_DOCUMENT_FONT
}

export function documentFontCss(value: unknown): string {
  const font = parseDocumentFont(value)
  return DOCUMENT_FONTS.find((f) => f.value === font)!.css
}

export function documentFontPdf(value: unknown): "Tinos" | "Geist" {
  const font = parseDocumentFont(value)
  return DOCUMENT_FONTS.find((f) => f.value === font)!.pdf
}

/**
 * Accepts only #rrggbb / #rgb. The value reaches react-pdf and inline styles,
 * so anything else falls back rather than being passed through.
 *
 * Always lowercase: `<input type="color">` sanitises anything that is not a
 * "valid simple color" - which the HTML spec defines as lowercase - back to
 * #000000, so an uppercase value would silently reset the picker to black.
 */
export function parsePaperColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_PAPER_COLOR
  const hex = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    const [, r, g, b] = hex
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return DEFAULT_PAPER_COLOR
}

/**
 * The live appearance setting, read from the business profile at render time.
 *
 * Deliberately NOT part of the finalize-time snapshot: an address frozen onto
 * a sent invoice is a record of what the client was told, but a typeface is
 * presentation. Switching to sans should restyle every document, not only the
 * ones raised afterwards.
 */
export type DocumentAppearanceSettings = {
  paperColor?: string | null
  documentFont?: string | null
}

export type DocumentPalette = {
  paper: string
  ink: string
  muted: string
  /** Hairline between table rows. */
  rowBorder: string
  /** Slightly stronger rule under the table head and above the total. */
  headBorder: string
  /** Filled band: the disclaimer box and the footer. */
  bandBg: string
  bandBorder: string
  /** The DRAFT watermark. */
  draftMark: string
  pageNumber: string
  /** True when the paper is dark enough to need light ink. */
  isDark: boolean
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`
}

/** WCAG relative luminance, used only to choose between dark and light ink. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** `amount` of `ink` laid over `paper`. */
function mix(ink: string, paper: string, amount: number): string {
  const a = toRgb(ink)
  const b = toRgb(paper)
  return toHex([0, 1, 2].map((i) => a[i] * amount + b[i] * (1 - amount)) as [number, number, number])
}

const LIGHT_INK = "#0a0a0a"
const DARK_PAPER_INK = "#f7f7f7"

// Ratios measured from the original white-paper document, so #FFFFFF paper
// reproduces it exactly. Changing one of these changes every document.
const MUTED = 140 / 245
const ROW_BORDER = 5 / 245
const HEAD_BORDER = 10 / 245
const BAND_BG = 2 / 245
const BAND_BORDER = 6 / 245
const DRAFT_MARK = 13 / 245
const PAGE_NUMBER = 76 / 245

export function documentPalette(paperColor?: string | null): DocumentPalette {
  const paper = parsePaperColor(paperColor)
  // 0.4 rather than 0.5: mid-tone papers read better with dark ink.
  const isDark = luminance(paper) < 0.4
  const ink = isDark ? DARK_PAPER_INK : LIGHT_INK

  return {
    paper,
    ink,
    muted: mix(ink, paper, MUTED),
    rowBorder: mix(ink, paper, ROW_BORDER),
    headBorder: mix(ink, paper, HEAD_BORDER),
    bandBg: mix(ink, paper, BAND_BG),
    bandBorder: mix(ink, paper, BAND_BORDER),
    draftMark: mix(ink, paper, DRAFT_MARK),
    pageNumber: mix(ink, paper, PAGE_NUMBER),
    isDark,
  }
}

/**
 * The shadcn theme tokens, re-pointed at the document palette.
 *
 * Set on the wrapper element, this makes every `bg-background`,
 * `text-muted-foreground` and `border` inside the preview resolve against the
 * paper instead of the app theme - no per-class rewriting needed.
 */
export function documentCssVars(palette: DocumentPalette): Record<string, string> {
  return {
    colorScheme: palette.isDark ? "dark" : "light",
    "--background": palette.paper,
    "--foreground": palette.ink,
    "--card": palette.paper,
    "--card-foreground": palette.ink,
    "--popover": palette.paper,
    "--popover-foreground": palette.ink,
    "--primary": palette.ink,
    "--primary-foreground": palette.paper,
    "--secondary": palette.bandBg,
    "--secondary-foreground": palette.ink,
    "--muted": palette.bandBg,
    "--muted-foreground": palette.muted,
    "--accent": palette.bandBg,
    "--accent-foreground": palette.ink,
    "--border": palette.headBorder,
    "--input": palette.headBorder,
    "--ring": palette.muted,
  } as Record<string, string>
}
