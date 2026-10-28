import { daysUntil, describeRenewal, KIND_LABEL, urgencyOf, type RenewalUrgency } from "@/lib/renewals"
import { formatTableDay } from "@/lib/dates"
import prisma from "@/lib/db"
import { paymentSummary } from "@/lib/money"

/**
 * What a client is allowed to see about their own account.
 *
 * This file is a disclosure boundary, and the rule it enforces is subtraction,
 * not selection: the portal is reached by an unguessable link with no login,
 * so anything this returns is effectively public to whoever holds the URL.
 * Every field below was chosen; nothing is spread in from a row.
 *
 * Deliberately NOT returned, and each for its own reason:
 *
 *  - Subscription.cost. What the agency PAYS a registrar is its margin. The
 *    client sees `price`, which is what they agreed to pay, and nothing that
 *    lets them derive the difference.
 *  - Project.description and Expense of any kind. Internal scoping notes and
 *    what the work cost to deliver are not the client's business.
 *  - Ticket.body and replies. A support thread can quote internal discussion;
 *    the portal shows that a ticket exists and where it stands.
 *  - Anything belonging to another client, or to the workspace at large.
 *    Every query below is scoped by this client's id AND its owning userId.
 *
 * Money is shown only where the client is the one paying it.
 */

export type PortalProject = {
  id: string
  title: string
  category: string | null
  /** The board column's name - "In Review", "Completed". */
  status: string
  /** True once it sits in a stage that closes as done. */
  delivered: boolean
  progress: number | null
  startedOn: string
  dueOn: string | null
  /** Past its date and not finished. */
  late: boolean
  openTasks: number
  totalTasks: number
}

export type PortalDocument = {
  id: string
  reference: string
  kind: string
  issuedOn: string
  dueOn: string | null
  total: number | null
  balance: number | null
  /** "Paid", "Partial", "Overdue", "Unpaid" - or null for a non-invoice. */
  paymentLabel: string | null
  currency: string
  /** Where they can open the document itself, when it has a share link. */
  shareSlug: string | null
}

export type PortalRenewal = {
  id: string
  name: string
  kind: string
  renewsOn: string
  dueLabel: string
  urgency: RenewalUrgency
  /** What THEY pay. Never what it costs us. */
  price: number | null
  currency: string
  cycleLabel: string
}

export type PortalTicket = {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  raisedOn: string
}

export type PortalData = {
  client: { id: string; name: string; email: string }
  agency: { name: string; logoUrl: string | null; email: string | null; phone: string | null }
  currency: string
  projects: PortalProject[]
  documents: PortalDocument[]
  renewals: PortalRenewal[]
  tickets: PortalTicket[]
  /** What they still owe across every issued invoice. */
  outstanding: number
}

const CYCLE_WORD: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
  BIENNIAL: "Every 2 years",
  TRIENNIAL: "Every 3 years",
}

/**
 * Everything one client may see about their own account.
 *
 * The caller has already proved who they are - see lib/portal-auth.ts, which
 * resolves the client from the signed-in Supabase account and never from
 * anything in the URL. This function trusts that id and nothing else.
 */
export async function getPortalData(
  clientId: string,
  now = new Date()
): Promise<PortalData | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      userId: true,
      fullName: true,
      businessName: true,
      email: true,
      defaultCurrency: true,
      archivedAt: true,
    },
  })
  if (!client || client.archivedAt) return null

  const [profile, projects, documents, subscriptions, tickets] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { userId: client.userId },
      select: { businessName: true, logoUrl: true, email: true, phone: true, currency: true },
    }),
    prisma.project.findMany({
      // Scoped by BOTH, so a client id from elsewhere reaches nothing.
      where: { clientId: client.id, userId: client.userId, archivedAt: null },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        category: true,
        progress: true,
        startedAt: true,
        createdAt: true,
        deadline: true,
        stage: { select: { name: true, type: true } },
        _count: { select: { tasks: true } },
        tasks: { where: { status: "OPEN" }, select: { id: true } },
      },
    }),
    prisma.document.findMany({
      where: {
        clientId: client.id,
        userId: client.userId,
        // A draft was never sent and a void was cancelled. Neither is
        // something the client should be looking at.
        status: { notIn: ["DRAFT", "VOID"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        refNumber: true,
        title: true,
        type: true,
        status: true,
        issueDate: true,
        createdAt: true,
        dueDate: true,
        totalAmount: true,
        amountPaid: true,
        advanceReceived: true,
        currency: true,
        publicSlug: true,
      },
    }),
    prisma.subscription.findMany({
      where: {
        clientId: client.id,
        userId: client.userId,
        archivedAt: null,
        status: "ACTIVE",
      },
      orderBy: { renewsOn: "asc" },
      select: {
        id: true,
        name: true,
        kind: true,
        renewsOn: true,
        cycle: true,
        price: true,
        currency: true,
      },
    }),
    prisma.ticket.findMany({
      where: { clientId: client.id, userId: client.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    }),
  ])

  const currency = client.defaultCurrency || profile?.currency || "INR"

  let outstanding = 0
  const portalDocuments: PortalDocument[] = documents.map((doc) => {
    const total = doc.totalAmount != null ? Number(doc.totalAmount) : null
    const tracksPayments = doc.type === "INVOICE"
    const summary = tracksPayments
      ? paymentSummary(
          total,
          Number(doc.amountPaid),
          doc.dueDate,
          false,
          doc.currency,
          Number(doc.advanceReceived),
          now
        )
      : null

    if (summary && doc.currency === currency) outstanding += summary.balance

    return {
      id: doc.id,
      reference: doc.refNumber || doc.title || "Document",
      kind: KIND_WORD[doc.type] ?? doc.type,
      issuedOn: formatTableDay(doc.issueDate ?? doc.createdAt),
      dueOn: doc.dueDate ? formatTableDay(doc.dueDate) : null,
      total,
      balance: summary ? summary.balance : null,
      paymentLabel: summary ? summary.label : null,
      currency: doc.currency,
      shareSlug: doc.publicSlug,
    }
  })

  return {
    client: {
      id: client.id,
      name: client.businessName || client.fullName,
      email: client.email,
    },
    agency: {
      name: profile?.businessName?.trim() || "Your agency",
      logoUrl: profile?.logoUrl?.trim() || null,
      email: profile?.email?.trim() || null,
      phone: profile?.phone?.trim() || null,
    },
    currency,
    projects: projects.map((project) => {
      const delivered = project.stage.type === "WON"
      return {
        id: project.id,
        title: project.title,
        category: project.category,
        status: project.stage.name,
        delivered,
        progress: project.progress,
        startedOn: formatTableDay(project.startedAt ?? project.createdAt),
        dueOn: project.deadline ? formatTableDay(project.deadline) : null,
        late: !delivered && project.deadline != null && project.deadline < now,
        openTasks: project.tasks.length,
        totalTasks: project._count.tasks,
      }
    }),
    documents: portalDocuments,
    renewals: subscriptions.map((sub) => {
      const days = daysUntil(sub.renewsOn, now)
      return {
        id: sub.id,
        name: sub.name,
        kind: KIND_LABEL[sub.kind],
        renewsOn: formatTableDay(sub.renewsOn),
        dueLabel: describeRenewal(days),
        urgency: urgencyOf(days),
        // price only. cost is never selected above, so it cannot leak here.
        price: sub.price != null ? Number(sub.price) : null,
        currency: sub.currency,
        cycleLabel: CYCLE_WORD[sub.cycle] ?? sub.cycle,
      }
    }),
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      reference: `TKT-${String(ticket.number).padStart(3, "0")}`,
      subject: ticket.subject,
      status: TICKET_WORD[ticket.status] ?? ticket.status,
      priority: ticket.priority.charAt(0) + ticket.priority.slice(1).toLowerCase(),
      raisedOn: formatTableDay(ticket.createdAt),
    })),
    outstanding,
  }
}

const KIND_WORD: Record<string, string> = {
  INVOICE: "Invoice",
  QUOTE: "Quotation",
  PROFORMA: "Proforma",
  CONTRACT: "Contract",
}

/** Worded for the person reading it, not for the operator. */
const TICKET_WORD: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "Being worked on",
  WAITING_ON_CLIENT: "Waiting on you",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}
