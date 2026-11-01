"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, CircleAlert, Sparkles } from "lucide-react"

import { ClientPicker, type PickableClient } from "@/components/app/client-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { CURRENCIES } from "@/lib/currencies"
import { MAX_DESCRIPTION_LENGTH, type ProposalBrief } from "@/lib/proposals/input"
import { cn } from "@/lib/utils"

import { checkProposalClientCode, createProposal, updateProposal, type CodeCheck } from "./actions"

type Defaults = {
  currency: string
  validityDays: number
  warrantyDays: number
  signatoryTitle?: string
}

type Props =
  | {
      mode: "create"
      clients: PickableClient[]
      initialClientId?: string
      /** Whether this person may add clients; without it only "existing" is offered. */
      canCreateClient: boolean
      defaults: Defaults
    }
  | {
      mode: "edit"
      proposalId: string
      clientLabel: string
      initialBrief: ProposalBrief
      defaults: Defaults
    }

/** Same first guess the server makes, shown before it answers. */
function previewCode(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4)
}

/** "80,000", "80000", "1.5L" is not a number - only digits, commas and a point. */
function parseAmount(text: string): number | null | "invalid" {
  const cleaned = text.replace(/[,\s]/g, "")
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : "invalid"
}

function parseDays(text: string): number | null | "invalid" {
  const cleaned = text.trim()
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isInteger(value) && value >= 0 ? value : "invalid"
}

function daysText(value: number | null | undefined): string {
  return value == null ? "" : String(value)
}

export function ProposalForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const initial = props.mode === "edit" ? props.initialBrief : null
  const canCreateClient = props.mode === "create" && props.canCreateClient

  // Client
  const [clientMode, setClientMode] = useState<"new" | "existing">(
    props.mode === "create" && (props.initialClientId || !props.canCreateClient) ? "existing" : "new"
  )
  const [clientId, setClientId] = useState(props.mode === "create" ? (props.initialClientId ?? "") : "")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [country, setCountry] = useState("")
  const [code, setCode] = useState("")
  const [codeTouched, setCodeTouched] = useState(false)
  const [codeCheck, setCodeCheck] = useState<CodeCheck | null>(null)

  // Project
  const [projectName, setProjectName] = useState(initial?.projectName ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [platforms, setPlatforms] = useState(initial?.platforms ?? "")

  // Price and timeline
  const [value, setValue] = useState(initial?.value != null ? String(initial.value) : "")
  const [currency, setCurrency] = useState(initial?.currency ?? props.defaults.currency)
  const [developmentDays, setDevelopmentDays] = useState(daysText(initial?.developmentDays))
  const [testingDays, setTestingDays] = useState(daysText(initial?.testingDays))
  const [warrantyDays, setWarrantyDays] = useState(
    daysText(initial ? initial.warrantyDays : props.defaults.warrantyDays)
  )
  const [validityDays, setValidityDays] = useState(String(initial?.validityDays ?? props.defaults.validityDays))
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? "")

  // Extras
  const [signatoryTitle, setSignatoryTitle] = useState(initial?.signatoryTitle ?? props.defaults.signatoryTitle ?? "")
  const [instructions, setInstructions] = useState(initial?.instructions ?? "")
  const [rewrite, setRewrite] = useState(true)

  // Ask the server for the code as the name is typed, or whether a typed code
  // is free. Debounced, and only the latest answer is kept.
  const checkSeq = useRef(0)
  useEffect(() => {
    if (props.mode !== "create" || clientMode !== "new") return
    const name = businessName.trim() || fullName.trim()
    if (!codeTouched && !name) return
    const seq = ++checkSeq.current
    const timer = setTimeout(async () => {
      const result = await checkProposalClientCode({ name, code: codeTouched ? code : undefined })
      if (seq === checkSeq.current) setCodeCheck(result)
    }, 400)
    return () => clearTimeout(timer)
  }, [props.mode, clientMode, businessName, fullName, code, codeTouched])

  const nameForCode = businessName.trim() || fullName.trim()
  const shownCode = codeTouched ? code : (codeCheck?.code ?? previewCode(nameForCode))
  const codeTaken = codeTouched && codeCheck?.code === code && !codeCheck.available

  // A visible clock while Claude writes: a minute of a frozen button reads as
  // a hang, and "34s" reads as work.
  useEffect(() => {
    if (!pending) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [pending])

  function buildBrief(): ProposalBrief | string {
    const amount = parseAmount(value)
    if (amount === "invalid") return "The project value should be a number, like 80000."
    const dev = parseDays(developmentDays)
    const testing = parseDays(testingDays)
    const warranty = parseDays(warrantyDays)
    const validity = parseDays(validityDays)
    if (dev === "invalid" || testing === "invalid" || warranty === "invalid" || validity === "invalid") {
      return "Days should be whole numbers."
    }
    if (dev === 0) return "Development days should be at least 1, or left blank."
    if (description.trim().length < 20) return "Describe the project in a sentence or two - Claude writes the proposal from it."

    return {
      projectName: projectName.trim() || undefined,
      description: description.trim(),
      value: amount,
      currency,
      developmentDays: dev,
      testingDays: testing,
      warrantyDays: warranty,
      validityDays: validity || 30,
      platforms: platforms.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      instructions: instructions.trim() || undefined,
      signatoryTitle: signatoryTitle.trim() || undefined,
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const brief = buildBrief()
    if (typeof brief === "string") {
      setError(brief)
      return
    }

    if (props.mode === "create") {
      if (clientMode === "existing" && !clientId) {
        setError("Pick the client this proposal is for.")
        return
      }
      if (clientMode === "new") {
        if (!fullName.trim()) return setError("Client name is required.")
        if (phone.replace(/\D/g, "").length < 6) return setError("Client phone number is required.")
        if (codeTaken) return setError(`Client code "${code}" is already used by another client.`)
      }
    }

    setElapsed(0)
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createProposal({
              brief,
              client:
                clientMode === "existing"
                  ? { mode: "existing", clientId }
                  : {
                      mode: "new",
                      client: {
                        fullName: fullName.trim(),
                        phone: phone.trim(),
                        businessName: businessName.trim() || undefined,
                        email: email.trim() || undefined,
                        address: address.trim() || undefined,
                        country: country.trim() || undefined,
                        code: codeTouched ? code : undefined,
                      },
                    },
            })
          : await updateProposal(props.proposalId, { brief, rewrite })

      if (result.ok) {
        router.push(`/dashboard/proposals/${result.id}`)
      } else {
        setError(result.error)
      }
    })
  }

  const writing = pending && (props.mode === "create" || rewrite)

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
        {props.mode === "create" ? (
          <Card>
            <CardHeader>
              <CardTitle>Client</CardTitle>
              <CardDescription>
                A name and phone number are enough. The client code goes into the proposal number and every invoice
                you raise for them later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canCreateClient && (
                <div role="radiogroup" aria-label="Client" className="inline-flex rounded-lg border p-0.5">
                  {(["new", "existing"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={clientMode === m}
                      onClick={() => setClientMode(m)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm transition-colors",
                        clientMode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {m === "new" ? "New client" : "Existing client"}
                    </button>
                  ))}
                </div>
              )}

              {clientMode === "existing" ? (
                <div className="space-y-2">
                  <Label>Client</Label>
                  <ClientPicker
                    clients={props.clients}
                    value={clientId}
                    onChange={setClientId}
                    allowNone={false}
                    allowCreate={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Their existing code is used, so this proposal and their invoices share it.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Client name *</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+91 98765 43210" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business name</Label>
                    <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">City or address</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dubai" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="UAE" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="code">Client code</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="code"
                        value={shownCode}
                        onChange={(e) => {
                          setCodeTouched(true)
                          setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))
                        }}
                        placeholder="AZ"
                        className="max-w-40 font-mono uppercase"
                        aria-invalid={codeTaken || undefined}
                        aria-describedby="code-hint"
                      />
                      {codeTouched && codeCheck?.code === code && code && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs",
                            codeCheck.available ? "text-tone-success" : "text-destructive"
                          )}
                        >
                          {codeCheck.available ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                          {codeCheck.available ? "Available" : "Already used by another client"}
                        </span>
                      )}
                    </div>
                    <p id="code-hint" className="text-xs text-muted-foreground">
                      This proposal will be PROP-{shownCode || "CODE"}-001, and their invoices INV-{shownCode || "CODE"}-001.
                      {!codeTouched && " Suggested from the name - type your own to change it."}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Client</CardTitle>
              <CardDescription>{props.clientLabel}. A proposal stays with the client it was numbered for.</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Project</CardTitle>
            <CardDescription>
              Claude writes the summary, scope, workflow, timeline and terms from this. The more specific, the better
              the proposal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project name</Label>
                <Input id="projectName" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Leave blank and Claude suggests one" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platforms">Platforms</Label>
                <Input id="platforms" value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder="Web app + Android app" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Project description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                rows={9}
                required
                placeholder={
                  "What the client does, what they need built, who will use it and what it must do.\n\n" +
                  "e.g. Artizo frames art for retail and wholesale customers in Dubai. They need one system to enter orders, " +
                  "track each job through the workshop, upload a photo of the finished frame, manage moulding and glass stock, " +
                  "and give salespeople a phone app to take orders on site."
                }
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {description.length.toLocaleString("en-US")} / {MAX_DESCRIPTION_LENGTH.toLocaleString("en-US")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price and timeline</CardTitle>
            <CardDescription>
              All optional. The price and each payment&apos;s amount are printed exactly as entered here - Claude never
              writes a figure. Leave the price blank and it reads &ldquo;To be confirmed&rdquo;.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-2">
                <Label htmlFor="value">Project value</Label>
                <Input id="value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="80,000" className="tabular-nums" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="developmentDays">Development days</Label>
                <Input id="developmentDays" inputMode="numeric" value={developmentDays} onChange={(e) => setDevelopmentDays(e.target.value)} placeholder="30" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="testingDays">Testing days</Label>
                <Input id="testingDays" inputMode="numeric" value={testingDays} onChange={(e) => setTestingDays(e.target.value)} placeholder="10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warrantyDays">Warranty days</Label>
                <Input id="warrantyDays" inputMode="numeric" value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value)} placeholder="30" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validityDays">Valid for (days)</Label>
                <Input id="validityDays" inputMode="numeric" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} placeholder="30" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment terms</Label>
              <Input
                id="paymentTerms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="40% advance, 30% when testing starts, 30% at go-live"
              />
              <p className="text-xs text-muted-foreground">Blank uses 40 / 30 / 30, or 50 / 50 for a small project.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anything else</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="signatoryTitle">Your title</Label>
              <Input id="signatoryTitle" value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} placeholder="CEO" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Notes for Claude</Label>
              <Textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="e.g. Mention Arabic support is phase two. Keep the scope to the web app only."
              />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {writing && (
        <div role="status" className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
          <Spinner className="mt-0.5" label="Writing" />
          <div>
            <p className="font-medium">
              Claude is writing the proposal<span className="tabular-nums text-muted-foreground"> · {elapsed}s</span>
            </p>
            <p className="text-muted-foreground">
              Usually under a minute. It opens here when it is ready; leaving this page does not stop it.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {props.mode === "edit" && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rewrite}
              onChange={(e) => setRewrite(e.target.checked)}
              disabled={pending}
              className="size-4 accent-primary"
            />
            Rewrite the proposal with Claude
            <span className="text-muted-foreground">(untick to change only the figures)</span>
          </label>
        )}
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Spinner className="mr-1.5" label="Working" />
          ) : (
            (props.mode === "create" || rewrite) && <Sparkles className="mr-1.5 size-4" />
          )}
          {props.mode === "create" ? "Write proposal" : rewrite ? "Save and rewrite" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}
