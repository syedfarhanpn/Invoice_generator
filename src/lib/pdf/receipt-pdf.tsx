import path from "node:path"
import { Document as PdfDocument, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { currencyDecimals } from "@/lib/currencies"
import { formatMoney } from "@/lib/money"
import type { ClientSnapshot, IssuerSnapshot } from "@/lib/types"
import type { PdfFontFamily } from "./invoice-pdf"

/**
 * Payment receipt: acknowledges money already received against an invoice.
 *
 * Deliberately a separate template rather than a DocumentType. A receipt has
 * no draft state, no line items and nothing to finalise - it records an event
 * that has already happened, so it is generated from the Payment row.
 *
 * Type sizes and colours are the same measured values as the invoice
 * (595.28pt / 800px), so the two documents look like they came from the same
 * business.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts")

// Registering here too: this module can be rendered without the invoice one
// ever being imported, and the built-in PDF fonts have no rupee glyph.
Font.register({
  family: "Tinos",
  fonts: [
    { src: path.join(FONT_DIR, "Tinos-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Tinos-Bold.ttf"), fontWeight: 700 },
  ],
})

const INK = "#0a0a0a"
const MUTED = "#737373"
const RULE = "#f5f5f5"
const BAND_BG = "#fdfdfd"
const BAND_BORDER = "#f9f9f9"
const PAD = 35.72

const styles = StyleSheet.create({
  page: { fontSize: 11.91, color: INK, backgroundColor: "#ffffff", paddingBottom: 120 },

  header: { paddingHorizontal: PAD, paddingTop: 26, paddingBottom: 23.81, color: "#ffffff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  heading: { fontSize: 35.72, fontWeight: 700, letterSpacing: -0.89, textTransform: "uppercase" },
  refLabel: { fontSize: 10.42, fontWeight: 500, letterSpacing: 1.04, textTransform: "uppercase", opacity: 0.8, textAlign: "right" },
  refValue: { fontSize: 14.88, fontWeight: 700, letterSpacing: 0.74, marginTop: 3, textAlign: "right" },

  body: { paddingHorizontal: PAD, paddingTop: PAD },
  label: { fontSize: 7.44, fontWeight: 700, letterSpacing: 0.74, color: MUTED, textTransform: "uppercase" },

  partyRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 40 },
  party: { width: 235.87 },
  partyName: { fontSize: 13.39, fontWeight: 700, color: INK, marginTop: 4, marginBottom: 2 },
  partyLine: { fontSize: 10.42, color: MUTED, lineHeight: 1.43 },

  // The amount is the point of the document, so it gets its own block.
  amountBox: {
    marginTop: 8,
    marginBottom: 28,
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: BAND_BG,
    borderWidth: 0.75,
    borderColor: RULE,
  },
  amountLabel: { fontSize: 7.44, fontWeight: 700, letterSpacing: 0.74, color: MUTED, textTransform: "uppercase" },
  amountValue: { fontSize: 28, fontWeight: 700, color: INK, marginTop: 6 },
  amountWords: { fontSize: 10.42, color: MUTED, marginTop: 6 },

  detailRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: RULE, paddingVertical: 9 },
  detailKey: { width: 150, fontSize: 10.42, color: MUTED },
  detailVal: { flex: 1, fontSize: 11.91, color: INK, fontWeight: 500 },

  balanceNote: { marginTop: 22, fontSize: 10.42, color: MUTED, lineHeight: 1.5 },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: PAD, paddingTop: 20, paddingBottom: 26,
    borderTopWidth: 0.6, borderTopColor: BAND_BORDER, backgroundColor: BAND_BG,
  },
  footerNote: { fontSize: 9.5, color: MUTED, lineHeight: 1.5 },
  pageNo: { position: "absolute", bottom: 6, right: PAD, fontSize: 7, color: "#b3b3b3" },
})

export type ReceiptPdfProps = {
  receiptNumber: string | null
  paidOn: Date
  amount: number
  method: string | null
  reference: string | null
  note: string | null
  currency: string
  /** The invoice this payment was made against. */
  invoiceRef: string | null
  invoiceTotal: number | null
  /** Everything received against that invoice, including this payment. */
  totalReceived: number
  issuer: IssuerSnapshot | null
  client: ClientSnapshot | null
  fontFamily?: PdfFontFamily
}

function formatDate(value: Date): string {
  // Matches the invoice, which mirrors what the on-screen document renders.
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(value)
}

export function ReceiptPdf(props: ReceiptPdfProps) {
  const {
    receiptNumber, paidOn, amount, method, reference, note, currency,
    invoiceRef, invoiceTotal, totalReceived, issuer, client,
    fontFamily = "Tinos",
  } = props

  const factor = 10 ** currencyDecimals(currency)
  const balanceMinor = Math.max(
    0,
    Math.round((invoiceTotal ?? 0) * factor) - Math.round(totalReceived * factor)
  )
  const settled = invoiceTotal != null && balanceMinor <= 0

  const details: [string, string | null][] = [
    ["Payment date", formatDate(paidOn)],
    ["Against invoice", invoiceRef],
    ["Method", method],
    ["Reference", reference],
  ]

  return (
    <PdfDocument
      title={receiptNumber || "Receipt"}
      author={issuer?.businessName || "Client Kit Studio"}
      subject={`Payment receipt${invoiceRef ? ` for ${invoiceRef}` : ""}`}
    >
      <Page size="A4" style={[styles.page, { fontFamily }]} wrap>
        <View style={[styles.header, { backgroundColor: issuer?.brandColor || "#000000" }]}>
          <View style={styles.headerRow}>
            <Text style={styles.heading}>Receipt</Text>
            <View>
              <Text style={styles.refLabel}>Receipt No.</Text>
              <Text style={styles.refValue}>{receiptNumber || "-"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.partyRow}>
            <View style={styles.party}>
              <Text style={styles.label}>Received By</Text>
              <Text style={styles.partyName}>{issuer?.businessName || "-"}</Text>
              {issuer?.ownerName && <Text style={styles.partyLine}>{issuer.ownerName}</Text>}
              {issuer?.address && <Text style={styles.partyLine}>{issuer.address}</Text>}
              {issuer?.email && <Text style={styles.partyLine}>{issuer.email}</Text>}
              {issuer?.taxId && <Text style={styles.partyLine}>Tax ID: {issuer.taxId}</Text>}
            </View>
            <View style={[styles.party, { alignItems: "flex-end" }]}>
              <Text style={[styles.label, { textAlign: "right" }]}>Received From</Text>
              <Text style={[styles.partyName, { textAlign: "right" }]}>
                {client?.businessName || client?.fullName || "-"}
              </Text>
              {client?.businessName && client?.fullName && (
                <Text style={[styles.partyLine, { textAlign: "right" }]}>{client.fullName}</Text>
              )}
              {client?.email && (
                <Text style={[styles.partyLine, { textAlign: "right" }]}>{client.email}</Text>
              )}
            </View>
          </View>

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Amount Received</Text>
            <Text style={styles.amountValue}>{formatMoney(amount, currency)}</Text>
            {note && <Text style={styles.amountWords}>{note}</Text>}
          </View>

          {details
            .filter(([, value]) => !!value)
            .map(([key, value]) => (
              <View key={key} style={styles.detailRow}>
                <Text style={styles.detailKey}>{key}</Text>
                <Text style={styles.detailVal}>{value}</Text>
              </View>
            ))}

          {invoiceTotal != null && (
            <Text style={styles.balanceNote}>
              {settled
                ? `This payment settles ${invoiceRef ?? "the invoice"} in full. Nothing further is due.`
                : `Total received against ${invoiceRef ?? "this invoice"}: ${formatMoney(
                    totalReceived,
                    currency
                  )} of ${formatMoney(invoiceTotal, currency)}. Balance outstanding: ${formatMoney(
                    balanceMinor / factor,
                    currency
                  )}.`}
            </Text>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerNote}>
            This receipt acknowledges the payment shown above. It is not a tax invoice - the
            invoice it refers to remains the tax document.
          </Text>
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
