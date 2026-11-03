"use client"

import { useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { COMPANY_CURRENCIES } from "@/lib/companies"
import {
  changeUserRole,
  createCompany,
  removeFromCompany,
  restoreUser,
  suspendUser,
  type CreateCompanyResult,
} from "./actions"

function useAdminAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<void>, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err) {
        // The server actions throw the guard's own reason, which is written
        // to be shown to a human.
        setError(err instanceof Error ? err.message : "That action could not be completed.")
      }
    })
  }

  return { run, pending, error }
}

const EMPTY_COMPANY = { companyName: "", ownerName: "", ownerEmail: "", currency: "INR" }

/**
 * Adds a company and its owner. The owner is emailed a link to set a
 * password; from there they run their own team in Team Management.
 */
export function AddCompanyForm() {
  const router = useRouter()
  const [fields, setFields] = useState(EMPTY_COMPANY)
  const [result, setResult] = useState<CreateCompanyResult | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (key: keyof typeof EMPTY_COMPANY) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }))

  return (
    <div className="space-y-4">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          setResult(null)
          startTransition(async () => {
            try {
              const outcome = await createCompany(fields)
              setResult(outcome)
              if (outcome.ok) {
                setFields(EMPTY_COMPANY)
                router.refresh()
              }
            } catch {
              setResult({ ok: false, error: "The company could not be added. Try again." })
            }
          })
        }}
      >
        <Field
          id="companyName"
          label="Company name"
          value={fields.companyName}
          onChange={set("companyName")}
          disabled={pending}
          placeholder="Artizo Interiors"
        />
        <Field
          id="ownerName"
          label="Owner's name"
          value={fields.ownerName}
          onChange={set("ownerName")}
          disabled={pending}
          placeholder="Adnan Vadakkan"
        />
        <Field
          id="ownerEmail"
          label="Owner's email"
          type="email"
          value={fields.ownerEmail}
          onChange={set("ownerEmail")}
          disabled={pending}
          placeholder="owner@company.com"
        />

        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            value={fields.currency}
            onChange={(e) => set("currency")(e.target.value)}
            disabled={pending}
            className="h-9 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {COMPANY_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending && <Spinner label="Adding company" className="mr-2" />}
            {pending ? "Adding..." : "Add company"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The owner gets an email to set a password, then adds their own team.
          </p>
        </div>
      </form>

      {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
      {result?.ok && <CompanyAdded result={result} />}
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  placeholder: string
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  )
}

/** What happened to the invitation, and the link when it has to go by hand. */
function CompanyAdded({ result }: { result: Extract<CreateCompanyResult, { ok: true }> }) {
  const [copied, setCopied] = useState(false)
  const { invite } = result

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <p>
        <span className="font-medium">{result.company}</span> is set up.{" "}
        {invite.emailed
          ? `An invitation to set a password was emailed to ${result.ownerEmail}.`
          : `${result.ownerEmail} is its owner.`}
      </p>
      {invite.problem && <p className="text-tone-warning">{invite.problem}</p>}
      {!invite.emailed && invite.actionUrl && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1.5 text-xs">
            {invite.actionUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invite.actionUrl ?? "")
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Submits a view form - the row's, or the one in the company popup. A form
 * rather than an onClick, so the pending state comes from the form itself.
 */
export function ViewCompanySubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Opening..." : children}
    </Button>
  )
}

export function UserRowActions({
  userId,
  email,
  role,
  status,
  isSelf,
  removableFrom,
}: {
  userId: string
  email: string
  role: "USER" | "SUPER_ADMIN"
  status: "ACTIVE" | "SUSPENDED"
  isSelf: boolean
  /** Their company, when they are in one as anything but its owner. */
  removableFrom: string | null
}) {
  const { run, pending, error } = useAdminAction()

  const removeButton = removableFrom && (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(
          () => removeFromCompany(userId),
          `Remove ${email} from ${removableFrom}? Their account stays; anything assigned to them becomes unassigned.`
        )
      }
    >
      Remove from company
    </Button>
  )

  // Your own platform role and status are not yours to change here, but
  // leaving a company is: it is how the platform admin steps out of one.
  if (isSelf) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {removeButton}
          <span className="text-xs text-muted-foreground">This is you</span>
        </div>
        {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {removeButton}
        {role === "USER" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => changeUserRole(userId, "SUPER_ADMIN"),
                `Make ${email} a platform admin? They will be able to see every company and manage every account, including yours.`
              )
            }
          >
            Make platform admin
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => changeUserRole(userId, "USER"),
                `Remove platform admin from ${email}? They keep their place in their company.`
              )
            }
          >
            Remove platform admin
          </Button>
        )}

        {status === "ACTIVE" ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              run(
                () => suspendUser(userId),
                `Suspend ${email}? They will be signed out and refused at the next request. Their data is kept.`
              )
            }
          >
            Suspend
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => restoreUser(userId))}>
            Restore
          </Button>
        )}
      </div>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
