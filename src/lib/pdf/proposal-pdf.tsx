import path from "node:path"
import { Document as PdfDocument, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import {
  documentFontPdf,
  documentPalette,
  type DocumentAppearanceSettings,
  type DocumentPalette,
} from "@/lib/document-theme"
import type { ProposalView, SectionKey } from "@/lib/proposals/view"

/**
 * The proposal as a PDF.
 *
 * Laid out after the studio's existing proposals: a cover, an at-a-glance
 * page, then one page per section, every page after the cover carrying the
 * proposal number and a page count. Everything printed comes from the
 * ProposalView, the same object the on-screen proposal renders, so the two
 * cannot disagree about a word or a figure.
 *
 * Paper colour and typeface follow Settings - Business, like the invoices.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts")

// Registered here too: this module can render without the invoice one ever
// being imported, and the built-in PDF fonts have no rupee glyph.
Font.register({
  family: "Geist",
  fonts: [
    { src: path.join(FONT_DIR, "Geist-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Geist-Bold.ttf"), fontWeight: 700 },
  ],
})
Font.register({
  family: "Tinos",
  fonts: [
    { src: path.join(FONT_DIR, "Tinos-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Tinos-Bold.ttf"), fontWeight: 700 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

const PAD = 48

function buildStyles(p: DocumentPalette) {
  return StyleSheet.create({
    page: {
      backgroundColor: p.paper,
      color: p.ink,
      fontSize: 9.5,
      lineHeight: 1.45,
      paddingTop: PAD,
      paddingHorizontal: PAD,
      paddingBottom: PAD + 24,
    },

    // Small caps label, used everywhere a heading is quiet.
    label: { fontSize: 7, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: p.muted },
    muted: { color: p.muted },

    // Cover
    cover: { flex: 1, justifyContent: "space-between" },
    coverTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    coverClient: { fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
    coverMeta: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "right", color: p.muted },
    coverTitle: { fontSize: 46, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.5, textTransform: "uppercase" },
    coverTagline: {
      marginTop: 18,
      maxWidth: 420,
      fontSize: 10,
      lineHeight: 1.55,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: p.muted,
    },
    coverFacts: { borderTopWidth: 0.75, borderTopColor: p.headBorder, paddingTop: 12 },
    factRow: { flexDirection: "row", paddingVertical: 3 },
    factKey: { width: 56, fontSize: 7, fontWeight: 700, letterSpacing: 1.2, color: p.muted, paddingTop: 1.5 },
    factValue: { flex: 1, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" },

    // At a glance
    glanceTitle: { fontSize: 38, fontWeight: 700, lineHeight: 1.05, textTransform: "uppercase", marginBottom: 36 },
    glanceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      borderBottomWidth: 0.75,
      borderBottomColor: p.rowBorder,
      paddingVertical: 10,
    },
    glanceValue: { fontSize: 15, fontWeight: 700, textAlign: "right", maxWidth: 330 },
    contents: { marginTop: 44 },
    contentsRow: { flexDirection: "row", paddingVertical: 4 },
    contentsNumber: { width: 34, fontSize: 9, fontWeight: 700, color: p.muted },
    contentsTitle: { fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase" },

    // Section page
    sectionHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      borderBottomWidth: 0.75,
      borderBottomColor: p.headBorder,
      paddingBottom: 8,
      marginBottom: 18,
    },
    sectionNumber: { fontSize: 26, fontWeight: 700, color: p.muted, lineHeight: 1 },
    sectionTitle: { fontSize: 9, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase" },
    headline: {
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.4,
      letterSpacing: 0.3,
      textTransform: "uppercase",
      marginBottom: 20,
    },
    block: { marginBottom: 20 },
    blockLabel: { marginBottom: 6 },

    // Tables
    tHead: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: p.headBorder, paddingBottom: 5 },
    tRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: p.rowBorder, paddingVertical: 6 },
    tTotal: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: p.headBorder, paddingTop: 7, marginTop: 1 },
    strong: { fontWeight: 700 },
    right: { textAlign: "right" },

    // Scope modules
    moduleGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    module: { width: "48%", marginBottom: 18 },
    moduleTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 2, marginBottom: 6 },
    bullet: { flexDirection: "row", marginBottom: 3 },
    bulletMark: { width: 10, color: p.muted },
    bulletText: { flex: 1 },

    // How it works
    flowBand: { backgroundColor: p.bandBg, borderWidth: 0.5, borderColor: p.bandBorder, padding: 10, marginBottom: 20 },
    flowText: { fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, lineHeight: 1.6, textTransform: "uppercase" },

    // Timeline chart
    chart: { marginBottom: 22 },
    chartTicks: { flexDirection: "row", marginLeft: 120, borderBottomWidth: 0.5, borderBottomColor: p.rowBorder, paddingBottom: 3 },
    chartTick: { fontSize: 6.5, color: p.muted, textAlign: "left" },
    chartRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
    chartName: { width: 120, paddingRight: 8, fontSize: 7.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" },
    chartTrack: { flex: 1, height: 10, position: "relative" },
    chartBar: { position: "absolute", top: 0, height: 10, backgroundColor: p.ink },

    // Commercials
    totalFigure: { fontSize: 32, fontWeight: 700, lineHeight: 1.1 },
    totalCaption: { marginTop: 4, marginBottom: 22 },

    // Terms
    termRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: p.rowBorder, paddingVertical: 7 },
    termLabel: { width: 112, paddingRight: 10, fontSize: 7, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: p.muted, paddingTop: 1.5 },
    termText: { flex: 1 },
    confirm: { flexDirection: "row", marginTop: 26, backgroundColor: p.bandBg, borderWidth: 0.5, borderColor: p.bandBorder, padding: 14 },

    // Parties
    parties: { flexDirection: "row", marginTop: 6 },
    party: { width: "50%", paddingRight: 16 },
    partyName: { fontSize: 10.5, fontWeight: 700, marginTop: 4, marginBottom: 3 },

    footer: {
      position: "absolute",
      left: PAD,
      right: PAD,
      bottom: 26,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 0.5,
      borderTopColor: p.rowBorder,
      paddingTop: 7,
      fontSize: 6.5,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: p.pageNumber,
    },
  })
}

type Styles = ReturnType<typeof buildStyles>

const sheetCache = new Map<string, Styles>()
function stylesFor(p: DocumentPalette): Styles {
  let sheet = sheetCache.get(p.paper)
  if (!sheet) {
    sheet = buildStyles(p)
    sheetCache.set(p.paper, sheet)
  }
  return sheet
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function Footer({ s, view }: { s: Styles; view: ProposalView }) {
  return (
    <View style={s.footer} fixed>
      <Text>{view.footer}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `${view.clientLabel}   ${pad2(pageNumber)} / ${pad2(totalPages)}`}
      />
    </View>
  )
}

function SectionHead({ s, view, section }: { s: Styles; view: ProposalView; section: SectionKey }) {
  const entry = view.sections.find((x) => x.key === section)
  if (!entry) return null
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionNumber}>{entry.number}</Text>
      <Text style={s.sectionTitle}>{entry.title}</Text>
    </View>
  )
}

function Bullets({ s, items }: { s: Styles; items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={s.bulletMark}>•</Text>
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

/** Column widths as fractions; a plain table is all any section needs. */
function Table({
  s,
  head,
  widths,
  rows,
  align,
  total,
}: {
  s: Styles
  head: string[]
  widths: string[]
  rows: string[][]
  align?: ("left" | "right")[]
  total?: string[]
}) {
  const cell = (i: number) => ({ width: widths[i], paddingRight: i < widths.length - 1 ? 8 : 0, textAlign: align?.[i] ?? "left" })
  return (
    <View>
      <View style={s.tHead}>
        {head.map((h, i) => (
          <Text key={i} style={[s.label, cell(i)]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={s.tRow} wrap={false}>
          {row.map((value, i) => (
            <Text key={i} style={[cell(i), i === 0 ? s.strong : {}]}>
              {value}
            </Text>
          ))}
        </View>
      ))}
      {total && (
        <View style={s.tTotal} wrap={false}>
          {total.map((value, i) => (
            <Text key={i} style={[cell(i), s.strong]}>
              {value}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

function Parties({ s, view }: { s: Styles; view: ProposalView }) {
  return (
    <View style={s.parties} wrap={false}>
      {[
        { label: "Client", party: view.parties.client },
        { label: "Service provider", party: view.parties.issuer },
      ].map(({ label, party }) => (
        <View key={label} style={s.party}>
          <Text style={s.label}>{label}</Text>
          <Text style={s.partyName}>{party.heading}</Text>
          {party.lines.map((line, i) => (
            <Text key={i} style={s.muted}>
              {line}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function Timeline({ s, view }: { s: Styles; view: ProposalView }) {
  const { phases, ticks, totalDays } = view.timeline
  if (!totalDays || phases.length === 0) return null
  const pct = (days: number) => `${(days / totalDays) * 100}%`

  return (
    <View style={s.chart} wrap={false}>
      <View style={s.chartTicks}>
        {ticks.map((tick) => (
          <Text key={tick.label} style={[s.chartTick, { width: pct(tick.end - tick.start + 1) }]}>
            {tick.label}
          </Text>
        ))}
      </View>
      {phases.map((phase, i) => (
        <View key={i} style={s.chartRow}>
          <Text style={s.chartName}>{phase.name}</Text>
          <View style={s.chartTrack}>
            <View
              style={[
                s.chartBar,
                { left: pct(phase.startDay - 1), width: pct(Math.max(phase.endDay - phase.startDay + 1, 0.6)) },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

function dayRange(start: number, end: number): string {
  return start === end ? String(start) : `${start}–${end}`
}

export function ProposalPdf({
  view,
  appearance,
}: {
  view: ProposalView
  appearance?: DocumentAppearanceSettings | null
}) {
  const palette = documentPalette(appearance?.paperColor)
  const s = stylesFor(palette)
  const fontFamily = documentFontPdf(appearance?.documentFont)
  const page = [s.page, { fontFamily }]

  return (
    <PdfDocument title={`${view.ref} — ${view.cover.projectName}`} author={view.issuerName} subject="Business proposal">
      {/* Cover: no footer, nothing but the title and who it is between. */}
      <Page size="A4" style={[...page, { paddingBottom: PAD }]}>
        <View style={s.cover}>
          <View style={s.coverTop}>
            <Text style={s.coverClient}>{view.clientLabel}</Text>
            <View>
              <Text style={s.coverMeta}>{view.dateLabel}</Text>
              <Text style={s.coverMeta}>Proposal {view.ref}</Text>
            </View>
          </View>

          <View>
            <Text style={s.coverTitle}>{view.cover.projectName}</Text>
            {view.cover.tagline ? <Text style={s.coverTagline}>{view.cover.tagline}</Text> : null}
          </View>

          <View style={s.coverFacts}>
            {[
              ["FOR", view.cover.forLine],
              ["BY", view.cover.byLine],
              ["VALID", view.cover.validLine],
            ].map(([key, value]) => (
              <View key={key} style={s.factRow}>
                <Text style={s.factKey}>{key}</Text>
                <Text style={s.factValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>

      <Page size="A4" style={page}>
        <Text style={s.glanceTitle}>{"Business\nproposal"}</Text>
        {view.glance.map((row) => (
          <View key={row.label} style={s.glanceRow}>
            <Text style={s.label}>{row.label}</Text>
            <Text style={s.glanceValue}>{row.value}</Text>
          </View>
        ))}
        <View style={s.contents}>
          <Text style={[s.label, s.blockLabel]}>Contents</Text>
          {view.sections.map((section) => (
            <View key={section.key} style={s.contentsRow}>
              <Text style={s.contentsNumber}>{section.number}</Text>
              <Text style={s.contentsTitle}>{section.title}</Text>
            </View>
          ))}
        </View>
        <Footer s={s} view={view} />
      </Page>

      <Page size="A4" style={page}>
        <SectionHead s={s} view={view} section="summary" />
        {view.summary.headline ? <Text style={s.headline}>{view.summary.headline}</Text> : null}
        {view.summary.needs.length > 0 && (
          <View style={s.block}>
            <Table
              s={s}
              head={["Your need", "What we deliver"]}
              widths={["38%", "62%"]}
              rows={view.summary.needs.map((row) => [row.need, row.delivery])}
            />
          </View>
        )}
        <Parties s={s} view={view} />
        <Footer s={s} view={view} />
      </Page>

      <Page size="A4" style={page}>
        <SectionHead s={s} view={view} section="scope" />
        {view.scope.headline ? <Text style={s.headline}>{view.scope.headline}</Text> : null}
        <View style={s.moduleGrid}>
          {view.scope.modules.map((module, i) => (
            <View key={i} style={s.module} wrap={false}>
              {module.label ? <Text style={s.label}>{module.label}</Text> : null}
              <Text style={s.moduleTitle}>{module.title}</Text>
              <Bullets s={s} items={module.items} />
            </View>
          ))}
        </View>
        <Footer s={s} view={view} />
      </Page>

      {view.howItWorks && (
        <Page size="A4" style={page}>
          <SectionHead s={s} view={view} section="howItWorks" />
          {view.howItWorks.headline ? <Text style={s.headline}>{view.howItWorks.headline}</Text> : null}
          {view.howItWorks.flow.length > 0 && (
            <View style={s.flowBand} wrap={false}>
              <Text style={[s.label, s.blockLabel]}>Flow</Text>
              <Text style={s.flowText}>{view.howItWorks.flow.join("  >  ")}</Text>
            </View>
          )}
          {view.howItWorks.stages.length > 0 && (
            <View style={s.block}>
              <Table
                s={s}
                head={["Stage", "What happens"]}
                widths={["24%", "76%"]}
                rows={view.howItWorks.stages.map((stage) => [stage.name, stage.description])}
              />
            </View>
          )}
          {view.howItWorks.roles.length > 0 && (
            <View style={s.block}>
              <Text style={[s.label, s.blockLabel]}>Users & access</Text>
              <Table
                s={s}
                head={["Role", "Platform", "Can do"]}
                widths={["24%", "20%", "56%"]}
                rows={view.howItWorks.roles.map((role) => [role.role, role.platform, role.canDo])}
              />
            </View>
          )}
          {view.howItWorks.note ? <Text style={s.muted}>{view.howItWorks.note}</Text> : null}
          <Footer s={s} view={view} />
        </Page>
      )}

      <Page size="A4" style={page}>
        <SectionHead s={s} view={view} section="timeline" />
        {view.timeline.headline ? <Text style={s.headline}>{view.timeline.headline}</Text> : null}
        <Timeline s={s} view={view} />
        {view.timeline.phases.length > 0 && (
          <Table
            s={s}
            head={["Days", "Phase", "Deliverable"]}
            widths={["12%", "28%", "60%"]}
            rows={view.timeline.phases.map((phase) => [
              dayRange(phase.startDay, phase.endDay),
              phase.name,
              phase.deliverable,
            ])}
          />
        )}
        <Footer s={s} view={view} />
      </Page>

      <Page size="A4" style={page}>
        <SectionHead s={s} view={view} section="commercials" />
        <Text style={s.totalFigure}>{view.commercials.total}</Text>
        <Text style={[s.label, s.totalCaption]}>Total project cost</Text>
        {view.commercials.items.length > 0 && (
          <View style={s.block}>
            <Table
              s={s}
              head={["Item", "Amount"]}
              widths={["75%", "25%"]}
              align={["left", "right"]}
              rows={view.commercials.items.map((item) => [item.label, item.value])}
              total={["Total project cost", view.commercials.total]}
            />
          </View>
        )}
        {view.commercials.schedule.length > 0 && (
          <View style={s.block}>
            <Text style={[s.label, s.blockLabel]}>Payment schedule</Text>
            <Table
              s={s}
              head={["Milestone", "Share", "Amount"]}
              widths={["60%", "15%", "25%"]}
              align={["left", "right", "right"]}
              rows={view.commercials.schedule.map((m) => [m.milestone, `${m.percent}%`, m.amount])}
            />
          </View>
        )}
        {view.commercials.exclusions.length > 0 && (
          <View style={s.block} wrap={false}>
            <Text style={[s.label, s.blockLabel]}>Not included</Text>
            <Bullets s={s} items={view.commercials.exclusions} />
          </View>
        )}
        <Footer s={s} view={view} />
      </Page>

      <Page size="A4" style={page}>
        <SectionHead s={s} view={view} section="terms" />
        {view.terms.map((term, i) => (
          <View key={i} style={s.termRow} wrap={false}>
            <Text style={s.termLabel}>{term.label}</Text>
            <Text style={s.termText}>{term.text}</Text>
          </View>
        ))}
        <View style={s.confirm} wrap={false}>
          <Text style={s.termLabel}>Confirm</Text>
          <Text style={s.termText}>{view.acceptance}</Text>
        </View>
        <Footer s={s} view={view} />
      </Page>
    </PdfDocument>
  )
}
