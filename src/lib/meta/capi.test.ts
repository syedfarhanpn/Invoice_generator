import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  hasMatchableIdentity,
  hashUserData,
  normalizeCountry,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeZip,
} from "@/lib/meta/capi-hash"
import {
  batchEvents,
  buildLeadStageEvent,
  dedupKey,
  isMetaLead,
  MAX_EVENT_AGE_DAYS,
  parseMetaLeadId,
  type LeadStageEventInput,
  type MetaServerEvent,
} from "@/lib/meta/capi-event"

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex")
const NOW = new Date("2026-10-29T10:00:00.000Z")

describe("normalizeEmail", () => {
  it("trims and lowercases, as Meta's example does", () => {
    expect(normalizeEmail("  John_Smith@GMAIL.com ")).toBe("john_smith@gmail.com")
  })

  it("is empty for nothing", () => {
    expect(normalizeEmail(null)).toBe("")
    expect(normalizeEmail("   ")).toBe("")
  })
})

describe("normalizePhone", () => {
  it("strips symbols and keeps the country code", () => {
    expect(normalizePhone("+1 (650) 555-1212", "1")).toBe("16505551212")
  })

  it("adds the country code to a bare national number", () => {
    // The case that matters here: an Indian mobile stored without +91
    // matches nothing unless the code is put back.
    expect(normalizePhone("98765 43210")).toBe("919876543210")
  })

  it("drops the trunk zero before adding the code", () => {
    expect(normalizePhone("098765 43210")).toBe("919876543210")
  })

  it("leaves a number that already carries a country code alone", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("919876543210")
    expect(normalizePhone("919876543210")).toBe("919876543210")
  })

  it("is empty for nothing", () => {
    expect(normalizePhone("")).toBe("")
    expect(normalizePhone("n/a")).toBe("")
  })
})

describe("normalizeName", () => {
  it("lowercases and drops punctuation and spaces", () => {
    expect(normalizeName("  O'Brien-Smith ")).toBe("obriensmith")
  })

  it("keeps non-Roman letters rather than erasing the name", () => {
    expect(normalizeName("ശ്യാം")).toBe("ശ്യാം")
  })
})

describe("normalizeZip", () => {
  it("cuts a US ZIP+4 to five digits", () => {
    expect(normalizeZip("94107-1234", "US")).toBe("94107")
  })

  it("leaves a non-US postcode whole, minus spaces", () => {
    expect(normalizeZip("M1 1AE", "GB")).toBe("m11ae")
    expect(normalizeZip("682 030", "India")).toBe("682030")
  })
})

describe("normalizeCountry", () => {
  it("passes a two-letter code through, lowercased", () => {
    expect(normalizeCountry("IN")).toBe("in")
  })

  it("maps the names this product actually sees", () => {
    expect(normalizeCountry("India")).toBe("in")
    expect(normalizeCountry("United States")).toBe("us")
    expect(normalizeCountry("U.A.E.")).toBe("ae")
  })

  it("drops an unknown name rather than truncating it", () => {
    // "Ireland" cut to two letters is Iran. Better to send nothing.
    expect(normalizeCountry("Ireland")).toBe("")
    expect(normalizeCountry("Freedonia")).toBe("")
  })
})

describe("hashUserData", () => {
  it("hashes the normalised value, not the raw one", () => {
    const hashed = hashUserData({ email: " Shyam@Pixiewebs.com " })
    expect(hashed.em).toEqual([sha("shyam@pixiewebs.com")])
  })

  it("never emits the hash of an empty string", () => {
    // That digest is a real constant; sending it would claim every lead
    // shares an address.
    const hashed = hashUserData({ email: "", phone: null, firstName: "  " })
    expect(hashed.em).toBeUndefined()
    expect(hashed.ph).toBeUndefined()
    expect(hashed.fn).toBeUndefined()
    expect(Object.keys(hashed)).toEqual([])
  })

  it("wraps each value in an array, as the API expects", () => {
    const hashed = hashUserData({ email: "a@b.com", phone: "9876543210" })
    expect(Array.isArray(hashed.em)).toBe(true)
    expect(hashed.ph).toEqual([sha("919876543210")])
  })

  it("never returns a value in the clear", () => {
    const hashed = hashUserData({
      email: "shyam@pixiewebs.com",
      phone: "+918921719015",
      firstName: "Shyam",
      lastName: "Prakash",
      city: "Kochi",
      country: "India",
    })
    const flat = JSON.stringify(hashed)
    expect(flat).not.toContain("shyam@pixiewebs.com")
    expect(flat).not.toContain("8921719015")
    expect(flat).not.toContain("Shyam")
    for (const values of Object.values(hashed)) {
      for (const v of values) expect(v).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

describe("hasMatchableIdentity", () => {
  it("needs an email or a phone, not a name and a country", () => {
    expect(hasMatchableIdentity(hashUserData({ firstName: "Shyam", country: "IN" }))).toBe(false)
    expect(hasMatchableIdentity(hashUserData({ email: "a@b.com" }))).toBe(true)
    expect(hasMatchableIdentity(hashUserData({ phone: "9876543210" }))).toBe(true)
  })
})

describe("parseMetaLeadId", () => {
  it("accepts Meta's integer ids", () => {
    expect(parseMetaLeadId("1234567890123456")).toBe(1234567890123456)
    expect(parseMetaLeadId(987654321)).toBe(987654321)
  })

  it("refuses anything that is not one of theirs", () => {
    expect(parseMetaLeadId(null)).toBeNull()
    expect(parseMetaLeadId("")).toBeNull()
    expect(parseMetaLeadId("abc")).toBeNull()
    expect(parseMetaLeadId("12ab")).toBeNull()
    expect(parseMetaLeadId(0)).toBeNull()
    expect(parseMetaLeadId(-5)).toBeNull()
  })
})

describe("dedupKey", () => {
  it("is stable for the same lead and stage", () => {
    // The whole point: a retry after a timeout must not count twice.
    expect(dedupKey("d1", "Qualified")).toBe(dedupKey("d1", "qualified"))
    expect(dedupKey("d1", "Proposal Sent")).toBe("deal:d1:proposal-sent")
  })

  it("differs per stage and per lead", () => {
    expect(dedupKey("d1", "Qualified")).not.toBe(dedupKey("d1", "Won"))
    expect(dedupKey("d1", "Qualified")).not.toBe(dedupKey("d2", "Qualified"))
  })
})

function input(overrides: Partial<LeadStageEventInput> = {}): LeadStageEventInput {
  return {
    dealId: "deal-1",
    stageName: "Qualified",
    occurredAt: new Date("2026-10-29T09:00:00.000Z"),
    leadCreatedAt: new Date("2026-10-27T09:00:00.000Z"),
    metaLeadId: "1234567890123456",
    identity: { email: "lead@example.com" },
    leadEventSource: "Pixie Webs CRM",
    ...overrides,
  }
}

function built(overrides: Partial<LeadStageEventInput> = {}): MetaServerEvent {
  const result = buildLeadStageEvent(input(overrides), NOW)
  if (!result.ok) throw new Error(`expected a built event, got: ${result.reason}`)
  return result.event
}

describe("buildLeadStageEvent", () => {
  it("sets the three fields that decide whether Meta counts it", () => {
    const event = built()
    // Anything but system_generated is read as a web event and never
    // attaches to the lead.
    expect(event.action_source).toBe("system_generated")
    // Without a custom parameter the event is rejected outright.
    expect(event.custom_data.event_source).toBe("crm")
    expect(event.custom_data.lead_event_source).toBe("Pixie Webs CRM")
  })

  it("sends the Meta lead id UNHASHED, and the email hashed", () => {
    const event = built()
    expect(event.user_data.lead_id).toBe(1234567890123456)
    expect(event.user_data.em).toEqual([sha("lead@example.com")])
  })

  it("names the event after the stage", () => {
    expect(built({ stageName: "Proposal Sent" }).event_name).toBe("Proposal Sent")
  })

  it("sends event_time as whole unix seconds", () => {
    const event = built()
    expect(event.event_time).toBe(Math.floor(Date.UTC(2026, 9, 29, 9, 0, 0) / 1000))
    expect(Number.isInteger(event.event_time)).toBe(true)
  })

  it("refuses a lead with nothing to match on", () => {
    const result = buildLeadStageEvent(
      input({ metaLeadId: null, identity: { firstName: "Anon" } }),
      NOW
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain("nothing to match on")
  })

  it("sends on hashed contact details alone when there is no Meta lead id", () => {
    // The CSV-imported leads: no instant-form id, but a phone number.
    const event = built({ metaLeadId: null, identity: { phone: "+91 98765 43210" } })
    expect(event.user_data.lead_id).toBeUndefined()
    expect(event.user_data.ph).toEqual([sha("919876543210")])
  })

  it("refuses an event Meta would discard for age, rather than risking the batch", () => {
    const result = buildLeadStageEvent(
      input({ occurredAt: new Date("2026-10-10T09:00:00.000Z"), leadCreatedAt: null }),
      NOW
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain(String(MAX_EVENT_AGE_DAYS))
  })

  it("accepts an event right at the age limit", () => {
    const atLimit = new Date(NOW.getTime() - MAX_EVENT_AGE_DAYS * 86_400_000 + 1000)
    const result = buildLeadStageEvent(
      input({ occurredAt: atLimit, leadCreatedAt: null }),
      NOW
    )
    expect(result.ok).toBe(true)
  })

  it("never dates a stage before the lead that reached it", () => {
    // Meta discards an event that precedes the lead's own creation.
    const event = built({
      occurredAt: new Date("2026-10-27T08:59:00.000Z"),
      leadCreatedAt: new Date("2026-10-27T09:00:00.000Z"),
    })
    expect(event.event_time).toBe(Math.floor(Date.UTC(2026, 9, 27, 9, 0, 0) / 1000))
  })

  it("pulls a future timestamp back to now rather than sending clock skew", () => {
    const event = built({ occurredAt: new Date("2026-11-02T00:00:00.000Z") })
    expect(event.event_time).toBe(Math.floor(NOW.getTime() / 1000))
  })

  it("refuses an empty lead_event_source instead of letting Meta drop it silently", () => {
    const result = buildLeadStageEvent(input({ leadEventSource: "  " }), NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain("lead_event_source")
  })

  it("refuses a stage with no name", () => {
    expect(buildLeadStageEvent(input({ stageName: "  " }), NOW).ok).toBe(false)
  })

  it("carries the deal value once there is one", () => {
    const event = built({ value: 45000, currency: "inr" })
    expect(event.custom_data.value).toBe(45000)
    expect(event.custom_data.currency).toBe("INR")
  })

  it("omits a zero value rather than teaching Meta the deal was worthless", () => {
    const event = built({ value: 0 })
    expect(event.custom_data.value).toBeUndefined()
    expect(event.custom_data.currency).toBeUndefined()
  })

  it("gives the same event_id on a retry of the same move", () => {
    expect(built().event_id).toBe(built().event_id)
    expect(built().event_id).toBe("deal:deal-1:qualified")
  })
})

describe("batchEvents", () => {
  const events = Array.from({ length: 2500 }, (_, i) => built({ dealId: `d${i}` }))

  it("splits at Meta's limit", () => {
    const batches = batchEvents(events)
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(1000)
    expect(batches[2]).toHaveLength(500)
  })

  it("keeps every event exactly once", () => {
    expect(batchEvents(events).flat()).toHaveLength(events.length)
  })

  it("returns nothing for nothing", () => {
    expect(batchEvents([])).toEqual([])
  })

  it("never exceeds the limit however it is called", () => {
    for (const batch of batchEvents(events, 99_999)) expect(batch.length).toBeLessThanOrEqual(1000)
  })
})

describe("isMetaLead", () => {
  it("recognises the sources Meta leads are actually filed under", () => {
    expect(isMetaLead("Meta Ads Sep-Oct")).toBe(true)
    expect(isMetaLead("facebook lead form")).toBe(true)
    expect(isMetaLead("Instagram")).toBe(true)
    expect(isMetaLead("FB ads")).toBe(true)
  })

  it("leaves out leads Meta never produced", () => {
    // Reporting these would train Meta's targeting on people it never reached.
    expect(isMetaLead("Mobile App")).toBe(false)
    expect(isMetaLead("Thaj referel")).toBe(false)
    expect(isMetaLead(null)).toBe(false)
    expect(isMetaLead("")).toBe(false)
  })

  it("does not match a word that merely contains the letters", () => {
    expect(isMetaLead("Metal works referral")).toBe(false)
    expect(isMetaLead("Big order")).toBe(false)
  })

  it("trusts a real Meta lead id whatever the source says", () => {
    expect(isMetaLead("Mobile App", "1234567890")).toBe(true)
    expect(isMetaLead("Mobile App", "not-an-id")).toBe(false)
  })
})
