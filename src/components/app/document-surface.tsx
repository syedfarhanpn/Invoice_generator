import { cn } from "@/lib/utils"
import {
  documentCssVars,
  documentFontCss,
  documentPalette,
  type DocumentFont,
} from "@/lib/document-theme"

/**
 * The sheet of paper a document is rendered on.
 *
 * It re-points the theme tokens at the chosen paper colour, so every
 * `bg-background` / `text-muted-foreground` / `border` inside the preview
 * resolves against the document rather than the app. That is what keeps the
 * preview honest: the editor now shows the same paper and ink the PDF will
 * print, instead of following the app's dark mode.
 */
export function DocumentSurface({
  paper,
  font,
  className,
  children,
}: {
  paper?: string | null
  font?: DocumentFont | string | null
  className?: string
  children: React.ReactNode
}) {
  const palette = documentPalette(paper)

  return (
    <div
      className={cn("bg-background text-foreground", className)}
      style={{
        ...documentCssVars(palette),
        fontFamily: documentFontCss(font),
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

/**
 * A signature always sits on light paper with dark ink, whatever the document
 * is printed on. A drawn signature is a PNG of black strokes on a transparent
 * background - on a dark sheet it disappears entirely, which is how this
 * started.
 */
export const SIGNATURE_PANEL_STYLE: React.CSSProperties = {
  backgroundColor: "#ffffff",
  color: "#0a0a0a",
  borderColor: "rgba(10, 10, 10, 0.12)",
}
