import path from "node:path"
import {
  Document as PdfDocument,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"
import type { DocumentType, TaxMode } from "@prisma/client"

import { currencyDecimals } from "@/lib/currencies"
import { documentKind } from "@/lib/document-kinds"
import { computeTotals, formatMoney, lineAmount } from "@/lib/money"
import type { ClientSnapshot, InvoiceContent, IssuerSnapshot } from "@/lib/types"

/**
 * Server-rendered PDF for the invoice family.
 *
 * This exists because browser printing cannot be trusted for a document a
 * client receives: pagination differs per browser and per printer driver, and
 * a footer can end up orphaned across a page break. Generating the PDF here
 * means every recipient gets byte-identical output.
 *
 * The numbers come from the same helpers the on-screen preview uses
 * (computeTotals / lineAmount / formatMoney), so the two can disagree about
 * styling but never about money.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts")

// The PDF built-in fonts have no rupee glyph, so amounts would render as
// blank boxes. Registered once at module load; see fonts/README.md.
Font.register({
  family: "Geist",
  fonts: [
    { src: path.join(FONT_DIR, "Geist-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Geist-Bold.ttf"), fontWeight: 700 },
  ],
})

// Tinos is metrically identical to Times New Roman, which is what the web
// preview currently falls back to, and unlike the PDF built-in Times it has a
// rupee glyph.
Font.register({
  family: "Tinos",
  fonts: [
    { src: path.join(FONT_DIR, "Tinos-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Tinos-Bold.ttf"), fontWeight: 700 },
  ],
})

/** Which family the document renders in. */
export type PdfFontFamily = "Geist" | "Tinos"

// Long unbroken strings (a pasted reference with no spaces) would otherwise
// overflow their column rather than wrapping.
Font.registerHyphenationCallback((word) => [word])

/**
 * Every value below is measured from the on-screen document and converted at
 * 595.28pt / 800px = 0.7441 pt-per-px, so the PDF is the same document at A4
 * rather than a lookalike. Colours are the browser-computed values converted
 * out of oklab into hex, which react-pdf needs.
 */
const INK = "#0a0a0a"
const MUTED = "#737373"
const ROW_BORDER = "#fafafa"
const HEAD_BORDER = "#f5f5f5"
const BAND_BG = "#fdfdfd"
const BAND_BORDER = "#f9f9f9"

/** Body padding: 48px -> 35.72pt. */
const PAD = 35.72

const styles = StyleSheet.create({
  page: { fontSize: 11.91, color: INK, backgroundColor: "#ffffff", paddingBottom: 150 },

  // Header band: 0px 48px 32px, 128px tall.
  header: { paddingHorizontal: PAD, paddingTop: 26, paddingBottom: 23.81, color: "#ffffff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  heading: { fontSize: 35.72, fontWeight: 700, letterSpacing: -0.89, textTransform: "uppercase" },
  refLabel: { fontSize: 10.42, fontWeight: 500, letterSpacing: 1.04, textTransform: "uppercase", opacity: 0.8, textAlign: "right" },
  refValue: { fontSize: 14.88, fontWeight: 700, letterSpacing: 0.74, marginTop: 3, textAlign: "right" },

  body: { paddingHorizontal: PAD, paddingTop: PAD },

  // Small caps labels: 10px -> 7.44pt, tracking 1px -> 0.74pt.
  label: { fontSize: 7.44, fontWeight: 700, letterSpacing: 0.74, color: MUTED, textTransform: "uppercase" },

  partyRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 47.62 },
  party: { width: 235.87 },
  partyName: { fontSize: 13.39, fontWeight: 700, color: INK, marginTop: 4, marginBottom: 2 },
  partyLine: { fontSize: 10.42, color: MUTED, lineHeight: 1.43 },

  metaRow: { flexDirection: "row", marginBottom: 35.72 },
  metaBlock: { marginRight: 47.62, maxWidth: 180 },
  metaValue: { fontSize: 11.91, color: INK, marginTop: 4 },

  // Table: head padding 12px -> 8.93pt, row padding 16px -> 11.91pt.
  tHead: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: HEAD_BORDER, paddingBottom: 8.93 },
  tRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: ROW_BORDER, paddingVertical: 11.91 },
  wDesc: { width: "50%", paddingRight: 10 },
  wQty: { width: "12%", textAlign: "center" as const },
  wRate: { width: "19%", textAlign: "right" as const },
  wAmount: { width: "19%", textAlign: "right" as const },
  cDesc: { width: "50%", paddingRight: 10, fontSize: 11.91, fontWeight: 500, color: INK },
  cQty: { width: "12%", textAlign: "center", fontSize: 11.91, color: MUTED },
  cRate: { width: "19%", textAlign: "right", fontSize: 11.91, color: MUTED },
  cAmount: { width: "19%", textAlign: "right", fontSize: 11.91, fontWeight: 700, color: INK },

  // Totals column: w-72 -> 214.3pt, right aligned.
  totals: { width: 214.3, alignSelf: "flex-end", marginTop: 17.86 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4.5 },
  totalLabel: { fontSize: 10.42, color: MUTED },
  totalValue: { fontSize: 10.42, fontWeight: 500, color: INK },
  rule: { borderTopWidth: 0.75, borderTopColor: HEAD_BORDER, marginVertical: 6 },
  grandLabel: { fontSize: 13.39, fontWeight: 700, letterSpacing: 0.67, color: INK, textTransform: "uppercase" },
  grandValue: { fontSize: 17.86, fontWeight: 700, color: INK },

  disclaimer: { marginTop: 17.86, padding: 9, backgroundColor: BAND_BG, fontSize: 8.9, color: MUTED },

  // Footer band: full bleed, bg #fdfdfd, padding 32px top / 40px bottom.
  // Fixed so a long item list can never orphan it across a page break, which
  // is exactly what browser printing did.
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row",
    paddingHorizontal: PAD, paddingTop: 23.81, paddingBottom: 29.76,
    borderTopWidth: 0.6, borderTopColor: BAND_BORDER, backgroundColor: BAND_BG,
  },
  footerCol: { width: 238 },
  footerColGap: { width: 47.62 },
  footerLine: { flexDirection: "row", marginBottom: 3 },
  footerKey: { width: 74, fontSize: 10.42, color: MUTED },
  footerVal: { flex: 1, fontSize: 10.42, color: INK, fontWeight: 500 },
  footerNote: { fontSize: 10.42, color: MUTED, lineHeight: 1.5 },
  pageNo: { position: "absolute", bottom: 6, right: PAD, fontSize: 7, color: "#b3b3b3" },

  draft: {
    position: "absolute", top: 290, left: 0, right: 0,
    textAlign: "center", fontSize: 110, fontWeight: 700,
    color: "#f2f2f2", transform: "rotate(-12deg)",
  },
})

export type InvoicePdfProps = {
  type: DocumentType
  refNumber: string | null
  isDraft: boolean
  title: string | null
  issueDate: Date | null
  dueDate: Date | null
  currency: string
  taxMode: TaxMode
  taxRate: number | null
  taxLabel: string | null
  advanceReceived: number
  content: InvoiceContent
  issuer: IssuerSnapshot | null
  client: ClientSnapshot | null
  /** Defaults to Geist; Tinos matches the current on-screen serif fallback. */
  fontFamily?: PdfFontFamily
}

/** Fixed format so the PDF never depends on the server's locale. */
function formatDate(value: Date | null): string {
  if (!value) return "-"
  // The on-screen document uses toLocaleDateString(), which on this app
  // renders M/D/YYYY. Pinned to en-US here so the PDF matches it exactly
  // rather than varying with the server locale.
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(value)
}

export function InvoicePdf(props: InvoicePdfProps) {
  const {
    type, refNumber, isDraft, title, issueDate, dueDate, currency,
    taxMode, taxRate, taxLabel, advanceReceived, content, issuer, client,
    fontFamily = "Tinos",
  } = props

  const kind = documentKind(type)
  const lineItems = content?.lineItems ?? []
  const totals = computeTotals(lineItems, currency, taxMode, taxRate)

  const decimals = currencyDecimals(currency)
  const factor = 10 ** decimals
  const advance = kind.supportsAdvance ? Math.max(0, advanceReceived || 0) : 0
  const showAdvance = Math.round(advance * factor) > 0
  const balanceDue = Math.max(0, totals.total - advance)
  // Same rule as the on-screen document: a Total that merely repeats the
  // Subtotal is dropped once an advance is deducted.
  const showTotalRow = !showAdvance || totals.total !== totals.subtotal

  const paymentLines = kind.showsPaymentDetails
    ? ([
        ["Method", issuer?.paymentMethod],
        ["Bank", issuer?.bankName],
        ["Account", issuer?.accountNumber],
        ["Routing", issuer?.routingSwift],
        ["UPI", issuer?.upiId],
      ] as const).filter(([, v]) => !!v)
    : []

  const brand = issuer?.brandColor || "#000000"

  return (
    <PdfDocument
      title={refNumber || kind.label}
      author={issuer?.businessName || "Client Kit Studio"}
      subject={`${kind.label}${refNumber ? ` ${refNumber}` : ""}`}
    >
      <Page size="A4" style={[styles.page, { fontFamily }]} wrap>
        <View style={[styles.header, { backgroundColor: brand }]} fixed={false}>
          <View style={styles.headerRow}>
            <Text style={styles.heading}>{kind.heading}</Text>
            <View>
              <Text style={styles.refLabel}>Reference</Text>
              <Text style={styles.refValue}>{refNumber || "Draft - unnumbered"}</Text>
            </View>
          </View>
        </View>

        {isDraft && <Text style={styles.draft} fixed>DRAFT</Text>}

        <View style={styles.body}>
          <View style={styles.partyRow}>
            <View style={styles.party}>
              <Text style={styles.label}>From</Text>
              <Text style={styles.partyName}>{issuer?.businessName || "-"}</Text>
              {issuer?.ownerName && <Text style={styles.partyLine}>{issuer.ownerName}</Text>}
              {issuer?.address && <Text style={styles.partyLine}>{issuer.address}</Text>}
              {issuer?.email && <Text style={styles.partyLine}>{issuer.email}</Text>}
              {issuer?.phone && <Text style={styles.partyLine}>{issuer.phone}</Text>}
              {issuer?.taxId && <Text style={styles.partyLine}>Tax ID: {issuer.taxId}</Text>}
            </View>
            <View style={[styles.party, { alignItems: "flex-end" }]}>
              <Text style={[styles.label, { textAlign: "right" }]}>Bill To</Text>
              <Text style={[styles.partyName, { textAlign: "right" }]}>{client?.businessName || client?.fullName || "-"}</Text>
              {client?.businessName && client?.fullName && (
                <Text style={[styles.partyLine, { textAlign: "right" }]}>{client.fullName}</Text>
              )}
              {client?.address && <Text style={styles.partyLine}>{client.address}</Text>}
              {client?.email && <Text style={styles.partyLine}>{client.email}</Text>}
              {client?.taxId && <Text style={styles.partyLine}>Tax ID: {client.taxId}</Text>}
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaBlock}>
              <Text style={styles.label}>Issue Date</Text>
              <Text style={styles.metaValue}>{formatDate(issueDate)}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.label}>{kind.dateLabel}</Text>
              <Text style={styles.metaValue}>{formatDate(dueDate)}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.label}>Title</Text>
              <Text style={styles.metaValue}>{title || "Untitled"}</Text>
            </View>
          </View>

          {/* Header repeats on every page so a long item list stays readable. */}
          <View style={styles.tHead} fixed>
            <Text style={[styles.label, styles.wDesc]}>Description</Text>
            <Text style={[styles.label, styles.wQty]}>Qty</Text>
            <Text style={[styles.label, styles.wRate]}>Rate</Text>
            <Text style={[styles.label, styles.wAmount]}>Amount</Text>
          </View>

          {lineItems.map((item, i) => (
            <View key={i} style={styles.tRow} wrap={false}>
              <Text style={styles.cDesc}>{item.description || "-"}</Text>
              <Text style={styles.cQty}>{item.qty}</Text>
              <Text style={styles.cRate}>{formatMoney(item.rate, currency)}</Text>
              <Text style={styles.cAmount}>{formatMoney(lineAmount(item, currency), currency)}</Text>
            </View>
          ))}

          <View style={styles.totals} wrap={false}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatMoney(totals.subtotal, currency)}</Text>
            </View>
            {taxMode === "PERCENTAGE" && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {taxLabel || "Tax"} ({taxRate ?? 0}%)
                </Text>
                <Text style={styles.totalValue}>{formatMoney(totals.taxAmount, currency)}</Text>
              </View>
            )}
            {showTotalRow && (
              <>
                <View style={styles.rule} />
                <View style={styles.totalRow}>
                  <Text style={showAdvance ? styles.totalLabel : styles.grandLabel}>Total</Text>
                  <Text style={showAdvance ? styles.totalValue : styles.grandValue}>
                    {formatMoney(totals.total, currency)}
                  </Text>
                </View>
              </>
            )}
            {showAdvance && (
              <>
                {!showTotalRow && <View style={styles.rule} />}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Less: amount received</Text>
                  <Text style={styles.totalValue}>-{formatMoney(advance, currency)}</Text>
                </View>
                <View style={styles.rule} />
                <View style={styles.totalRow}>
                  <Text style={styles.grandLabel}>Balance Due</Text>
                  <Text style={styles.grandValue}>{formatMoney(balanceDue, currency)}</Text>
                </View>
              </>
            )}
          </View>

          {kind.disclaimer && <Text style={styles.disclaimer}>{kind.disclaimer}</Text>}
        </View>

        <View style={styles.footer} fixed>
          <View style={styles.footerCol}>
            {paymentLines.length > 0 && (
              <>
                <Text style={[styles.label, { marginBottom: 6 }]}>Payment Details</Text>
                {paymentLines.map(([key, value]) => (
                  <View key={key} style={styles.footerLine}>
                    <Text style={styles.footerKey}>{key}</Text>
                    <Text style={styles.footerVal}>{value}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
          <View style={styles.footerColGap} />
          <View style={styles.footerCol}>
            <Text style={[styles.label, { marginBottom: 6 }]}>Notes</Text>
            <Text style={styles.footerNote}>{content?.notes || "-"}</Text>
          </View>
        </View>

        <Text
          style={styles.pageNo}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </PdfDocument>
  )
}
