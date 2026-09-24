---
version: 1
slug: "src-app-workspace-crm-page-tsx"
primary_target: "src/app/(workspace)/crm/page.tsx"
related_targets: ["src/app/(workspace)/layout.tsx"]
---

# CRM — surface brief

Scope: the CRM module (leads, pipeline, activity, conversion) inside a new app shell. Visitor mode: Operate.

Audience and job: the studio operator, working alone between client work. Triage leads arriving from Meta lead ads and a plain HTML site form, set a next action, and convert a won lead into the existing Client record so the quotation-to-receipt chain continues.

Content and proof: live workspace data only, no invented figures. Lead volume ranges from zero, to 10-50 a week typically, to 200+ in the days after an ad performs; the surface must hold all three.

Constraints: light, minimal, restrained — no dark theme and no vibrant palette (PRODUCT.md, binding). Invite-only access, INR defaults, one-currency totals. Document dates stay UTC-pinned; follow-ups and calendar entries run in IST. The invoice generator keeps its current design until approved separately.

Memorable moment: the empty NEXT ACTION cell on the newest lead — the only coloured thing on the screen, asking to be filled.

Unresolved: whether leads carry an assignee once other operators join; Google Calendar two-way sync is a later phase.

## Direction contract

THESIS: One calm table is the product, and Inbox, Board and Agenda are three lenses on the same rows. It refuses the category default: a pastel kanban as the home screen with every record hidden inside a card.

OWN-WORLD: Near-white ground #FCFCFC, panels #F7F7F6, hairlines #ECEDEE, ink #1F2124, muted ink #6B7076. One accent, steel blue #4A6E8A, for selection and links. One signal, clay #A5563F, used only for late or changed. System sans throughout with tabular figures in every numeric column. The row is the only primitive; rows compose into table, board card and agenda item. Separators are hairlines, never boxes; elevation is a ground shift, never a shadow. Row height 44px comfortable, 32px compact.

STORY: The operator opens the CRM and sees, in one screen, everything that arrived and everything that is late. They understand nothing is hiding. They believe the tool is keeping count for them. They fill the top row's next action and move down.

FIRST VIEWPORT: A 240px module sidebar on the left. A 56px header carries the view switcher on the left, search and density on the right. The table fills everything below: SOURCE mark, NAME, VALUE right-aligned in tabular figures, STAGE, NEXT ACTION, DUE. The newest unanswered lead sits at the top with its empty NEXT ACTION cell as the only clay element on screen; that cell is the primary action. Selecting a row opens a 400px right pane with no page change.

FORM: The Quiet Table, position 2 of the three conventional candidates presented in the safer register, chosen by the user over my recommendation. Seed key 61e9922f, direction scope, operate mode, re-roll round 2, safer register, assignment suspended by the register.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
