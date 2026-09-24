# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — the operator.** An independent web agency owner (PixieWebs, Kerala, India) who runs all of their own client paperwork alone, between doing the actual client work. They arrive with a job in hand: quote a new piece of work, turn an accepted quote into an invoice, chase what is late, or send a client proof that they paid. They work in INR, in IST, and are the same person who configures the business profile, raises the document, and records the payment.

**Secondary — invited operators.** A small, hand-picked set of other freelancers and agencies given accounts on the same product. Each gets their own workspace of clients, documents and business profile. There is no public signup: access is granted, never self-serve.

**Third party — the client.** The person who receives a document. They are not a user and never create an account. They open a link, read the document, sign a contract in the browser, download a PDF, and receive a receipt. Everything they need happens without a login.

## Product Purpose

Client Kit Studio is the single place an independent studio keeps its client paperwork. It generates quotations, proforma invoices, contracts and invoices, records payments against them, issues receipts, and shares each one with the client as a link or a PDF.

Success is that the operator can get a correct, branded, client-ready document out quickly, and can answer "what is owed to me, and what is late" at a glance without opening a spreadsheet or an accounting suite.

## Positioning

**The whole paper trail on one client thread.** Quotation → proforma → contract with in-browser e-signature → invoice → payment → receipt all live against the same client, in one product. The neighbouring products are invoicing tools with contracts and e-signature bolted on from somewhere else; here the chain is the product. Future work should strengthen that chain rather than add parallel tools beside it.

## Operating Context

- A solo operator switching between client delivery and admin, usually on a desktop browser, often at odd hours.
- Work arrives as: a new enquiry to quote, an accepted quote to convert, a signed contract to invoice against, or a payment to record.
- Clients receive documents as links and PDFs, typically by email or messaging, and often open them on a phone.
- Money moves by bank transfer and UPI. Advances and part payments are normal, not edge cases.
- Documents are legal and financial records: once issued they are expected to stay fixed, which is why finalized documents freeze a snapshot of the issuer and client details.

## Capabilities and Constraints

**Documents.** Four creatable types — invoice, proforma invoice, quotation, contract — moving through draft, finalized, signed, void and archived. Drafts are editable; finalizing assigns a reference number and freezes an issuer/client snapshot so later profile edits never rewrite a sent document.

**Clients.** Each client carries a serial code used to build document reference numbers (e.g. `INV-BELL-001`).

**Payments and receipts.** Part payments, advances received before issue, and per-payment receipts with their own numbers and downloadable PDFs.

**Sharing and signing.** Every document can be shared by public slug. Clients view, download a PDF, and sign contracts by typing or drawing — with no account.

**Business profile.** Logo, brand colour, contact and tax identity (including GSTIN), currency, tax mode/rate/label, payment details (bank and UPI), a default invoice note, document appearance (paper colour and typeface), and a counter-signature name.

**REST API.** A `/api/v1` surface for clients and documents, authenticated by API key rather than cookies, with key management in settings, so another system can push clients and draft documents in.

**Administration.** Roles (super admin, user) and account status (active, suspended) held in the database, with an admin console and an audit trail. A bootstrap super-admin address is always restored so the operator cannot lock themselves out.

**Durable constraints the user confirmed must not be broken:**

- **Invite-only access.** No public signup. An authenticated account with no user record is refused unless it is the bootstrap address. Provisioning fails closed.
- **India-first tax and payment fields.** GSTIN, UPI and rupee defaults stay first-class, not one locale among many.
- **One-currency totals.** Dashboard and analytics totals only ever sum a single currency and say so when documents in other currencies exist. They are never silently added together.
- **Client links need no login.** Viewing, signing, downloading and receipts keep working for someone who has no account and never makes one.

**Further constraints established in the code:**

- Money is held and summed in integer minor units through one shared helper, so no two screens can disagree about a total.
- Dates on documents are formatted in a pinned locale and UTC, so the on-screen document and the PDF always show the same day.
- Document PDFs embed their own fonts because the built-in PDF fonts have no rupee glyph.
- Colour is never the only way information is conveyed: the dashboard chart pairs every series with a label, a keyboard path and a table view, and its palette is checked for colour-blind separation.
- Database migrations are applied by a custom script rather than `prisma migrate deploy`, which hangs against the hosted connection pooler.

**Terminology.** "Document" is the umbrella for invoice, proforma, quotation and contract. "Finalize" is the irreversible step that numbers a document and freezes its snapshot. "Advance" is money held before a document was raised. "Share link" is the client-facing public URL.

## Brand Commitments

- **Name:** Client Kit Studio.
- **Operator business:** PixieWebs.
- **Existing assets:** app icons only (`src/app/icon.png`, `apple-icon.png`, `favicon.ico`). There is no logo mark, wordmark or marketing imagery in the repository; `public/` still holds only the default Next.js starter SVGs.
- **Interface constraint (binding).** Light, minimal and restrained: no dark theme and no vibrant or saturated palettes. Neutrals with a single muted accent that only ever carries meaning. Craft bar: Notion's air and Attio's density.
- No voice or tone guidelines have been established. Beyond the name and the interface constraint above, nothing here is binding.

## Evidence on Hand

- A live production workspace with real clients, documents, payments and shared links. Screenshots and figures can be taken from it.
- No testimonials, case studies, customer names, logos, press, pricing, benchmarks, uptime claims or user counts exist. Future work must not invent any of these.
- The README is untouched `create-next-app` boilerplate and carries no product truth.
- The landing page currently has one headline and one subhead and no other marketing content.

## Product Principles

1. **One thread per client, end to end.** Every artifact from quotation to receipt belongs to the same client. A feature earns its place by strengthening that chain, not by standing beside it.
2. **The client never signs up.** Anything the recipient must do happens through a link that needs no account, on whatever device they opened it on.
3. **Access is administered, not self-serve.** Accounts are granted. When provisioning is uncertain, refuse rather than admit.
4. **Money is exact and never blended.** Integer minor units, one currency per total, and an explicit note when other currencies are present.
5. **The screen and the PDF must agree.** Dates, fonts, paper, totals and appearance settings render the same in the editor, the client's share link and the downloaded file.
