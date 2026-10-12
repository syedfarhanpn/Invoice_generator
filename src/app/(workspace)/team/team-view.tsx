"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Lock, Plus, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  ACCESS_LABEL,
  ACCESS_LEVELS,
  MODULE_LABEL,
  MODULES,
  type Access,
  type Module,
} from "@/lib/permissions"
import type { InviteOutcome } from "@/lib/invites"
import { cn } from "@/lib/utils"

import {
  createDepartment,
  inviteMember,
  resendInvite,
  setMemberDepartment,
  setMemberRole,
  setMemberStatus,
  setPermissions,
} from "./actions"

/**
 * Team Management.
 *
 * Everything about who someone is and what they may do lives here, and
 * nothing about it is duplicated in Settings - that separation is the brief's
 * and it is worth keeping: an operator looking for "who can see invoices"
 * should have exactly one place to look.
 *
 * The controls disable themselves for the owner and for the signed-in person
 * editing themselves. That is a courtesy so the UI matches what will happen;
 * the refusal itself is in actions.ts, on the server.
 */

export type MemberRow = {
  id: string
  name: string
  email: string
  initials: string
  role: string
  roleLabel: string
  status: string
  departmentId: string | null
  departmentName: string | null
  title: string | null
  lastActiveLabel: string | null
  joinedLabel: string | null
  /** Resolved through the same code the server gates with. */
  summary: string
  matrix: Record<Module, Access>
  /** What is stored for this one person, as opposed to inherited. */
  overrides: Partial<Record<Module, Access>>
  isOwner: boolean
  isSelf: boolean
}

export type RoleRow = {
  role: string
  label: string
  members: number
  summary: string
  matrix: Record<Module, Access>
  /** What the workspace has stored, as opposed to the built-in default. */
  overrides: Partial<Record<Module, Access>>
}

export type ActivityRow = {
  id: string
  summary: string
  actorName: string | null
  whenLabel: string
}

export type Option = { id: string; label: string }

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-tone-success-bg text-tone-success",
  INVITED: "bg-tone-info-bg text-tone-info",
  SUSPENDED: "bg-tone-danger-bg text-tone-danger",
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  SUSPENDED: "Suspended",
}

const ACCESS_TONE: Record<Access, string> = {
  none: "text-muted-foreground",
  read: "text-tone-info",
  write: "text-tone-success",
}

type Tab = "members" | "roles" | "activity"

export function TeamView({
  members,
  roles,
  activity,
  departments,
  assignableRoles,
  canEdit,
}: {
  members: MemberRow[]
  roles: RoleRow[]
  activity: ActivityRow[]
  departments: Option[]
  assignableRoles: Option[]
  /** False for someone who may look at the team but not change it. */
  canEdit: boolean
}) {
  const [tab, setTab] = useState<Tab>("members")
  const [inviting, setInviting] = useState(false)
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null)
  const [resending, setResending] = useState<MemberRow | null>(null)
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null)

  const counts = useMemo(
    () => ({
      active: members.filter((m) => m.status === "ACTIVE").length,
      invited: members.filter((m) => m.status === "INVITED").length,
      suspended: members.filter((m) => m.status === "SUSPENDED").length,
    }),
    [members]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Team" className="flex gap-1 rounded-xl border bg-card p-1.5">
          {(
            [
              { id: "members", label: `Members (${members.length})` },
              { id: "roles", label: "Roles & permissions" },
              { id: "activity", label: "Activity" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-current={tab === entry.id ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === entry.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        {canEdit && tab === "members" && (
          <Button size="sm" onClick={() => setInviting(true)}>
            <Plus className="mr-1.5 size-4" /> Invite someone
          </Button>
        )}
      </div>

      {tab === "members" && (
        <section className="rounded-xl border bg-card">
          <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-xs text-muted-foreground">
            <span>{counts.active} active</span>
            {counts.invited > 0 && <span>· {counts.invited} invited</span>}
            {counts.suspended > 0 && <span>· {counts.suspended} suspended</span>}
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-normal">Member</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Department</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Access</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Last active</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <MemberRowView
                    key={member.id}
                    member={member}
                    departments={departments}
                    assignableRoles={assignableRoles}
                    canEdit={canEdit}
                    onEditPermissions={() => setEditingMember(member)}
                    onResendInvite={() => setResending(member)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "roles" && (
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">What each role can reach</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              These apply to everyone holding the role. A single person can be given something
              different from the Members tab.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-normal">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">People</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Access</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Customised</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => {
                  const owner = role.role === "OWNER"
                  return (
                    <tr key={role.role} className="border-b">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {owner && <ShieldCheck className="size-3.5 text-tone-success" strokeWidth={2} />}
                          {role.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                        {role.members}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{role.summary}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {owner ? (
                          <span className="text-xs">Always full access</span>
                        ) : Object.keys(role.overrides).length > 0 ? (
                          `${Object.keys(role.overrides).length} changed`
                        ) : (
                          <span className="text-xs">Defaults</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canEdit && !owner && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingRole(role)}
                          >
                            Edit access
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {canEdit && <DepartmentManager departments={departments} />}
        </section>
      )}

      {tab === "activity" && (
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">What has changed</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every change to someone&apos;s role, status or access. Nothing is ever removed from
              this list.
            </p>
          </header>
          {activity.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing has changed yet.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {activity.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block">{entry.summary}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.actorName ?? "A removed member"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.whenLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={inviting} onOpenChange={(open) => !open && setInviting(false)}>
        <DialogContent>
          <InviteForm
            departments={departments}
            assignableRoles={assignableRoles}
            onClose={() => setInviting(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={resending != null} onOpenChange={(open) => !open && setResending(null)}>
        <DialogContent>
          {resending && (
            <ResendInviteForm
              key={resending.id}
              member={resending}
              onClose={() => setResending(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editingRole != null} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {editingRole && (
            <PermissionEditor
              key={editingRole.role}
              title={`What ${editingRole.label} can reach`}
              description="Applies to everyone holding this role."
              matrix={editingRole.matrix}
              scope="role"
              scopeKey={editingRole.role}
              onClose={() => setEditingRole(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editingMember != null} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {editingMember && (
            <PermissionEditor
              key={editingMember.id}
              title={`What ${editingMember.name} can reach`}
              description={`Overrides the ${editingMember.roleLabel} role for this person alone.`}
              matrix={editingMember.matrix}
              scope="member"
              scopeKey={editingMember.id}
              onClose={() => setEditingMember(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MemberRowView({
  member,
  departments,
  assignableRoles,
  canEdit,
  onEditPermissions,
  onResendInvite,
}: {
  member: MemberRow
  departments: Option[]
  assignableRoles: Option[]
  canEdit: boolean
  onEditPermissions: () => void
  onResendInvite: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The owner and your own row are not editable - the server refuses both,
  // and a control that looks available but always fails is worse than none.
  const locked = member.isOwner || member.isSelf
  const editable = canEdit && !locked

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try {
        await fn()
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not work.")
      }
    })

  return (
    <tr className="border-b align-top">
      <td className="px-4 py-2.5">
        <span className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
            {member.initials}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate">{member.name}</span>
              {member.isOwner && (
                <ShieldCheck className="size-3.5 shrink-0 text-tone-success" strokeWidth={2} />
              )}
              {member.isSelf && <span className="text-xs text-muted-foreground">you</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
            {error && <span className="block text-xs text-destructive">{error}</span>}
          </span>
        </span>
      </td>

      <td className="px-4 py-2.5">
        {editable ? (
          <select
            value={member.role}
            disabled={pending}
            onChange={(e) => run(() => setMemberRole(member.id, e.target.value))}
            aria-label={`Role for ${member.name}`}
            className="h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {assignableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {locked && <Lock className="size-3" strokeWidth={2} />}
            {member.roleLabel}
          </span>
        )}
      </td>

      <td className="px-4 py-2.5">
        {canEdit && !member.isOwner ? (
          <select
            value={member.departmentId ?? ""}
            disabled={pending}
            onChange={(e) => run(() => setMemberDepartment(member.id, e.target.value || null))}
            aria-label={`Department for ${member.name}`}
            className="h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Not assigned</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted-foreground">{member.departmentName ?? "—"}</span>
        )}
      </td>

      <td className="px-4 py-2.5">
        <span className="block text-muted-foreground">{member.summary}</span>
        {/* This column shows what they have been given; the status column
            says whether it is live yet. Without this line the two read as a
            contradiction. */}
        {member.status === "INVITED" && (
          <span className="block text-xs text-tone-warning">Applies once they sign in</span>
        )}
        {member.status === "SUSPENDED" && (
          <span className="block text-xs text-tone-warning">Paused while suspended</span>
        )}
        {canEdit && !member.isOwner && (
          <button
            type="button"
            onClick={onEditPermissions}
            className="rounded-sm text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Object.keys(member.overrides).length > 0
              ? `${Object.keys(member.overrides).length} set for them`
              : "Customise"}
          </button>
        )}
      </td>

      <td className="px-4 py-2.5">
        <span
          className={cn(
            "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
            STATUS_TONE[member.status] ?? "bg-muted text-muted-foreground"
          )}
        >
          {STATUS_LABEL[member.status] ?? member.status}
        </span>
        {editable && member.status !== "INVITED" && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                setMemberStatus(member.id, member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")
              )
            }
            className="mt-1 block rounded-sm text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {member.status === "ACTIVE" ? "Suspend" : "Reinstate"}
          </button>
        )}
        {/* The whole reason anyone is stuck at "Invited": until now nothing
            ever sent them a way in. This is how an existing row gets one,
            without deleting and re-adding them and losing their audit trail. */}
        {canEdit && member.status === "INVITED" && (
          <button
            type="button"
            onClick={onResendInvite}
            className="mt-1 block rounded-sm text-xs text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Resend invite
          </button>
        )}
      </td>

      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
        {member.lastActiveLabel ?? (member.status === "INVITED" ? "Not signed in yet" : "—")}
      </td>
    </tr>
  )
}

/**
 * Edits one matrix, for a role or for a person.
 *
 * Saves all thirteen modules at once rather than one at a time: a
 * half-applied permission matrix is a security state nobody chose.
 */
function PermissionEditor({
  title,
  description,
  matrix,
  scope,
  scopeKey,
  onClose,
}: {
  title: string
  description: string
  matrix: Record<Module, Access>
  scope: "role" | "member"
  scopeKey: string
  onClose: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Record<Module, Access>>(matrix)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await setPermissions({ scope, key: scopeKey, grants: draft })
        router.refresh()
        onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not save.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {MODULES.map((module) => (
            <li key={module} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm">{MODULE_LABEL[module]}</span>
              <span className="flex shrink-0 gap-1">
                {ACCESS_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={draft[module] === level}
                    onClick={() => setDraft((prev) => ({ ...prev, [module]: level }))}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      draft[module] === level
                        ? cn("border-ring bg-accent font-medium", ACCESS_TONE[level])
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {ACCESS_LABEL[level]}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>

        {draft.team === "write" && (
          <p className="text-xs text-tone-warning">
            Anyone with edit access to Team Management can change everyone else&apos;s permissions,
            including yours.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save access"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function InviteForm({
  departments,
  assignableRoles,
  onClose,
}: {
  departments: Option[]
  assignableRoles: Option[]
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    email: "",
    role: assignableRoles[0]?.id ?? "DEVELOPER",
    departmentId: "",
    title: "",
    note: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const result = await inviteMember({
          email: form.email,
          role: form.role,
          departmentId: form.departmentId || null,
          title: form.title || null,
          note: form.note || null,
        })
        router.refresh()
        // The member is in either way. Only close on a clean send - if the
        // email did not go out, the link in the result is the operator's only
        // copy of it and closing the dialog would throw it away.
        if (result.emailed) onClose()
        else setOutcome(result)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not work.")
      }
    })
  }

  if (outcome) {
    return <InviteOutcomePanel outcome={outcome} email={form.email} onClose={onClose} />
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite someone</DialogTitle>
        <DialogDescription>
          They get an email in your company&rsquo;s name with a link to set a password. What they
          can reach is decided by the role you pick.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="name@company.com"
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-department">Department</Label>
            <select
              id="invite-department"
              value={form.departmentId}
              onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value }))}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Not assigned</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="invite-title">Job title</Label>
          <Input
            id="invite-title"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Shown beside their name"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="invite-note">Add a note (optional)</Label>
          <Textarea
            id="invite-note"
            rows={3}
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            placeholder="Anything you want them to read before they sign in."
          />
          <p className="text-xs text-muted-foreground">
            Appears in the email above the button. The role and what it grants are filled in
            automatically.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Inviting..." : "Send invitation"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

/**
 * Sends the invitation again for someone already on the team.
 *
 * Same email, same link machinery - the only thing it does not do is touch
 * the membership, which already exists with its role, department and history
 * intact.
 */
function ResendInviteForm({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null)
  const [pending, startTransition] = useTransition()

  if (outcome) {
    return <InviteOutcomePanel outcome={outcome} email={member.email} onClose={onClose} />
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Resend invitation</DialogTitle>
        <DialogDescription>
          Sends {member.email} a fresh link to set a password. Their role and access are unchanged.
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          startTransition(async () => {
            try {
              const result = await resendInvite(member.id, note || null)
              router.refresh()
              if (result.emailed) onClose()
              else setOutcome(result)
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "That did not work.")
            }
          })
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="resend-note">Add a note (optional)</Label>
          <Textarea
            id="resend-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you want them to read before they sign in."
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending..." : "Send invitation"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

/**
 * Shown when the member was added but the email did not go out.
 *
 * The link is the whole point of this panel: it is one-time, it is not stored
 * anywhere, and closing without copying it means generating another. So it is
 * selectable text rather than a button that only works if the clipboard API
 * is available.
 */
function InviteOutcomePanel({
  outcome,
  email,
  onClose,
}: {
  outcome: InviteOutcome
  email: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{email} is in the workspace</DialogTitle>
        <DialogDescription>{outcome.problem}</DialogDescription>
      </DialogHeader>

      {outcome.actionUrl ? (
        <div className="space-y-2">
          <Label htmlFor="invite-link">Their sign-in link</Label>
          <textarea
            id="invite-link"
            readOnly
            rows={3}
            value={outcome.actionUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none rounded-md border bg-muted/40 p-2 font-mono text-xs break-all outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(outcome.actionUrl!)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <span className="text-xs text-muted-foreground">
              One use only, and it expires. Send a fresh one from their row if it lapses.
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          You can send them an invitation from their row once this is configured.
        </p>
      )}

      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  )
}

function DepartmentManager({ departments }: { departments: Option[] }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="border-t px-4 py-4">
      <h3 className="text-sm font-semibold">Departments</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Used for assigning people and for attributing overhead expenses.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {departments.map((department) => (
          <span key={department.id} className="rounded-full border px-2.5 py-1 text-xs">
            {department.label}
          </span>
        ))}
        {departments.length === 0 && (
          <span className="text-xs text-muted-foreground">None yet.</span>
        )}
      </div>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          startTransition(async () => {
            try {
              await createDepartment(name)
              setName("")
              router.refresh()
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "That did not work.")
            }
          })
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a department"
          aria-label="New department name"
          className="h-8 w-56"
          required
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Add
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </form>
    </div>
  )
}
