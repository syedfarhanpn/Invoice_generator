# Invoice & Contract Studio — Build Plan

**Status:** planning complete, no code written yet
**Date:** 2026-08-24
**Stack (existing):** Next.js 16 (App Router) · Prisma 7 + Postgres · Supabase Auth · Tailwind 4 + shadcn · Vercel

---

## 1. Locked decisions

| Decision | Choice |
|---|---|
| Auth | Single super-admin. No signup, anywhere. |
| Serial format | `INV-ACME-001` / `CON-ACME-001` — client code + per-client counter |
| Contracts | In-browser e-signature, locks document to `SIGNED` |
| Tax | Switchable per document: none, or a labelled percentage |
| Currency | Default set in business settings, overridable per client and per document |
| PDF (now) | Print-to-PDF via print stylesheet on the share page |
| PDF (later) | Server-side Chromium route, when emailing/archiving is needed |
| Email | **Deferred to phase 2.** Download + share link manually for now. |
| Hosting | Vercel |

---

## 2. Problems in the current code to fix first

These are pre-existing issues in the scaffold, not new work. They're listed in the order they bite.

### 2.1 The app is not actually single-admin
`src/app/login/actions.ts` still exports a `signup()` server action, and `getCurrentUser()` in `src/lib/current-user.ts` upserts a Prisma `User` for **any** Supabase email that authenticates. Any account that exists gets its own workspace.

Three layers of fix, all required:
1. Delete the `signup` action and any UI referencing it.
2. Disable signups in the Supabase dashboard (Authentication → Providers → Email → "Allow new users to sign up" off). Without this the REST endpoint still accepts registrations even with no UI.
3. Add `SUPER_ADMIN_EMAIL` to env and hard-check it in `getCurrentUser()` — if the authenticated email doesn't match, sign out and redirect. This is the layer that survives a Supabase misconfiguration.

### 2.2 Share links are guessable
`publicSlug` is currently `document.id.slice(-8)` — derived from the id already visible in the dashboard URL. Replace with a random 22-character nanoid, stored unique, regenerable (revoke old link) and independent of the document id.

### 2.3 The unauthenticated PDF route
`src/app/api/documents/[id]/pdf/route.ts` takes a raw document id, does no auth check, and serves the PDF to anyone. It also injects `a, button { display: none }` which will hide every link inside the invoice body, not just the chrome. Both go away with the print-CSS approach; when the server route returns in phase 2 it must authenticate or accept only a valid `publicSlug`.

### 2.4 Historical documents mutate — highest priority
The share page joins `businessProfile` and `client` **live**. Change your address, or a client's company name, and every invoice ever issued silently rewrites itself. This is a correctness and record-keeping problem, not a cosmetic one.

**Fix:** documents become snapshots. On finalize, freeze into `content`:
- issuer block (business name, address, tax id, logo url, bank details)
- client block (name, business, address, tax id)
- line items with resolved unit prices
- tax mode, rate, label
- currency and its symbol/locale
- computed subtotal, tax amount, total

After finalize, the renderer reads **only** from `content`. Live tables are used for drafts only.

---

## 3. Schema changes

### 3.1 `Client` — add code + counters

```prisma
model Client {
  // ... existing fields
  code           String   // "ACME" — uppercase, editable until first document
  clientNumber   Int      // internal sequential, for sorting/fallback
  invoiceSeq     Int      @default(0)
  contractSeq    Int      @default(0)
  defaultCurrency String?
  taxId          String?  // GSTIN or equivalent
  archivedAt     DateTime?

  @@unique([userId, code])
}
```

`code` is auto-suggested from `businessName` (fall back to `fullName`): strip non-alpha, uppercase, take first 4 chars, append a numeric suffix on collision (`ACME`, `ACME2`). Editable at creation, **locked once the client has any document** — otherwise historical serials stop resolving.

### 3.2 `DocumentType` — trim the enum

Current enum has 12 members. Keep three for now:

```prisma
enum DocumentType {
  INVOICE
  CONTRACT
  QUOTE      // scaffolded, converts to invoice in phase 2
}
```

The other nine (`WELCOME_DOC`, `DISCOVERY_CALL`, `PROJECT_BRIEF`, `TASK_LIST`, `DELIVERY_GUIDE`, `MONTHLY_REPORT`, `THANK_YOU_DOC`, `FEEDBACK_REQUEST`, `PACKAGE_MENU`, `BROLL_CHECKLIST`) move to the phase-2 backlog. Each one needs its own editor and renderer; building all twelve is roughly ten times the work of building three. Note `CLIENT_AGREEMENT` is renamed to `CONTRACT` — this needs a data migration if any rows exist.

### 3.3 `Document` — numbering, tax, snapshot

```prisma
model Document {
  // ... existing fields
  refNumber     String?   // NULL while draft, assigned on finalize
  sequence      Int?      // the numeric part, for ordering
  finalizedAt   DateTime?
  taxMode       TaxMode   @default(NONE)
  taxRate       Decimal?  @db.Decimal(5,2)
  taxLabel      String?   // "GST", "VAT", "Sales Tax"
  subtotal      Decimal?  @db.Decimal(12,2)
  taxAmount     Decimal?  @db.Decimal(12,2)
  amountPaid    Decimal   @default(0) @db.Decimal(12,2)
  slugRevokedAt DateTime?
  payments      Payment[]

  @@unique([userId, refNumber])
}

enum TaxMode { NONE PERCENTAGE }
```

Widen `totalAmount` from `Decimal(10,2)` to `Decimal(12,2)` — ten digits caps out around 99 million minor units, which is tight for INR.

### 3.4 New: `Payment`

```prisma
model Payment {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  amount     Decimal  @db.Decimal(12,2)
  paidOn     DateTime
  method     String?  // "UPI", "Bank transfer", "Cash"
  reference  String?
  note       String?
  createdAt  DateTime @default(now())
}
```

Status becomes derived, not stored: `amountPaid == 0` → unpaid · `0 < amountPaid < total` → partial · `>= total` → paid · unpaid past `dueDate` → overdue.

### 3.5 `BusinessProfile` — signature defaults

Add `defaultTaxMode`, `defaultTaxRate`, `defaultTaxLabel`, `defaultPaymentTerms` (days), `signatureName`, `signatureImageUrl`.

---

## 4. Serial number allocation

Assigned **on finalize, not on create.** Drafts display "Draft — unnumbered". This keeps sequences gapless; assign-on-create leaves permanent holes whenever a draft is deleted.

```
allocateRef(clientId, type):
  BEGIN TRANSACTION
    SELECT code, invoiceSeq, contractSeq FROM Client
      WHERE id = clientId FOR UPDATE     -- row lock, no duplicates on double-click
    next = (type == INVOICE ? invoiceSeq : contractSeq) + 1
    UPDATE Client SET <seq> = next
    ref = PREFIX + "-" + code + "-" + pad(next, 3)
  COMMIT
  return { ref, sequence: next }
```

`pad(n, 3)` gives `001`; past 999 it widens naturally to `1000` rather than truncating. Prefix is `INV` for invoices, `CON` for contracts, `QUO` for quotes. The `@@unique([userId, refNumber])` constraint is the backstop if the lock is ever bypassed.

**Edge cases to handle:** deleting a finalized document must not decrement the counter (leaves a gap — correct behaviour, the number was issued). Changing a document's client after finalize is disallowed; void and reissue instead.

---

## 5. Money handling

- All arithmetic in **integer minor units** (paise/cents) inside the editor. Never accumulate JS floats.
- Convert to `Decimal` only at the Prisma boundary.
- Round once, at the total — not per line item.
- Tax computed on the subtotal after any line-level discounts.
- Store currency as ISO code; format at render with `Intl.NumberFormat` and the document's own locale, so an old INR invoice keeps rendering in INR after you switch your default to USD.

---

## 6. Sharing and history

- `publicSlug`: random nanoid(22), generated on first share, regenerable. Regenerating sets `slugRevokedAt` and dead-links the old URL.
- Share page is public and unauthenticated by design, but returns 404 for drafts — only finalized documents are viewable.
- Every event writes a `DocumentActivity` row: `created`, `finalized`, `shared`, `viewed`, `downloaded`, `signed`, `payment_recorded`, `voided`. `viewed` records IP-hash and user-agent, deduped to one row per hour per viewer so a refresh doesn't spam the log.
- The client detail page renders this as a timeline — that's the "history of documents shared" requirement.

---

## 7. E-signature (contracts)

1. Client opens the share link, reads the contract, checks an "I agree" box.
2. Signs — typed name in a script font, or drawn on a canvas.
3. Submit stores into `signatureData`: signature type, the typed name or PNG data-url, timestamp, IP hash, user-agent, and the SHA-256 hash of the rendered contract content at signing time.
4. Document flips to `SIGNED`, `content` freezes permanently, share page renders read-only with the signature block and an audit footer.

The content hash is what makes it meaningful — it proves what was signed, so a later edit can't be passed off as the agreed text. Once `SIGNED`, all edit routes reject.

This is a good-faith e-signature record, not a certified/qualified digital signature. Fine for freelance client agreements; not equivalent to an Aadhaar eSign or DSC.

---

## 8. PDF

**Phase 1 — print stylesheet.** The share page gets an `@media print` block: A4 page size, zero margins, `print-color-adjust: exact` so the brand colour survives, `break-inside: avoid` on line-item rows, repeated table headers on multi-page invoices, and all navigation chrome hidden. "Download PDF" calls `window.print()`. Zero infrastructure, works on Vercel today, output quality is genuinely good.

**Phase 2 — server route.** `@sparticuz/chromium` + `puppeteer-core`, function memory raised to 1024MB+, rendering the same share page with a signed internal token. Needed the moment you want to email a PDF attachment or archive generated PDFs to Blob storage. Remove the plain `puppeteer` dependency now — it will fail the Vercel bundle size limit whether or not the route is called.

---

## 9. Build order

Each phase ends at a point where the app is coherent and demo-able.

### Phase 1 — Lock it down *(small)*
- Remove `signup` action + UI
- Disable signups in Supabase dashboard
- `SUPER_ADMIN_EMAIL` allowlist in `getCurrentUser()`
- Drop the `puppeteer` dependency
- **Demo checkpoint:** only your email can get in; every other credential bounces.

### Phase 2 — Data model *(medium)*
- All schema changes from §3, one migration
- Backfill `code` / `clientNumber` for existing clients
- `allocateRef()` with the row lock, plus unit tests for concurrent allocation
- Money helpers (minor units, rounding, formatting)
- **Demo checkpoint:** nothing visible yet — this is the foundation the rest stands on.

### Phase 3 — Invoices end-to-end *(large)*
- Client create/edit with auto-suggested code, locked after first document
- Invoice editor: line items, tax toggle (none/percentage), currency picker, dates, notes
- Live preview beside the editor
- Finalize → allocate serial, snapshot content, lock editing
- Print stylesheet + download
- Share link generation with nanoid, view logging
- **Demo checkpoint: this is a showable product.** Add a client, build an invoice, download it, send someone the link, watch the view register.

### Phase 4 — Payments *(small)*
- Record payment dialog, payment list on the document
- Derived status badges, overdue flagging
- Dashboard tiles: outstanding, paid this month, overdue count
- **Demo checkpoint:** the money story is complete.

### Phase 5 — Contracts + e-signature *(medium)*
- Contract editor (rich text with a few structured fields)
- `CON-ACME-001` numbering via the same allocator
- Public signing flow, content hashing, signed-state lock
- Signature audit block on the rendered document
- **Demo checkpoint:** full feature set.

### Phase 6 — Polish
- Empty states, loading skeletons, error boundaries
- Mobile layout for the share page — clients open these on phones
- Duplicate-invoice action
- Seed script with two sample clients and a few documents, for demoing

---

## 10. Phase-2 backlog (agreed, deferred)

Ordered by my estimate of value-to-effort:

1. **Email sending** (Resend) — send the document from the app, real `sent` timestamps. Explicitly deferred by you; download-and-share manually for now.
2. **UPI QR code on invoices** — client scans and pays. Cheap to build, high value for Indian clients.
3. **Duplicate / recurring invoices** — one click to clone last month's retainer invoice. Likely the biggest ongoing time saver.
4. **Saved line items** — a library of your services with default rates.
5. **Quote → invoice conversion** — the `QUOTE` type is scaffolded in phase 2 for this.
6. **Client portal** — one permanent link per client showing all their documents, instead of a fresh link each time.
7. **CSV export** for your accountant.
8. **Server-side PDF** — prerequisite for #1's attachments.
9. **Indian GST proper** — CGST/SGST split, IGST, HSN/SAC, place of supply. The switchable percentage tax covers you until you're filing GST returns from this data.
10. **The other nine document types** — welcome doc, discovery call, project brief, monthly report, package menu, b-roll checklist, and the rest.
11. **Payment reminders** — scheduled nudge on overdue invoices.

---

## 11. Open risks

- **Vercel bundle size** — `puppeteer` must be removed in phase 1 or builds may fail regardless of the PDF approach chosen.
- **`CLIENT_AGREEMENT` → `CONTRACT`** — enum rename needs a data migration if rows already exist. Check before migrating.
- **Prisma 7 + `prisma.config.ts`** — the runtime `url` lives in the config file, not the datasource block (installed prisma@7.9.1's config type only accepts `url`/`shadowDatabaseUrl` — no `directUrl`, despite some upgrade docs mentioning one). Migrations run through `scripts/apply-migrations.mjs`, which reads `DIRECT_URL` from `.env` directly, not `prisma migrate dev`/`deploy`. Keep to that path.
- **Client code immutability** — if a code is ever edited after documents exist, historical serials become unresolvable. The lock must be enforced server-side, not just disabled in the UI.
- **Repo name** — the project is `client-kit-studio` in `package.json`. Worth deciding on the real product name before deploying, since it surfaces in URLs.
