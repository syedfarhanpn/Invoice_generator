import { describe, expect, it } from "vitest"

import { normalizeMetaInput } from "./view"

describe("normalizeMetaInput", () => {
  it("cleans the fields", () => {
    expect(
      normalizeMetaInput({ datasetId: " 1234567890 ", accessToken: " EAAB123 ", testEventCode: " TEST1 " })
    ).toEqual({ ok: true, datasetId: "1234567890", accessToken: "EAAB123", testEventCode: "TEST1" })
  })

  it("treats a blank token as keep-the-current-one, and a blank test code as live", () => {
    expect(normalizeMetaInput({ datasetId: "1234567890", accessToken: "  ", testEventCode: "" })).toEqual({
      ok: true,
      datasetId: "1234567890",
      accessToken: null,
      testEventCode: null,
    })
  })

  it("refuses a dataset id that is not the number from Events Manager", () => {
    for (const datasetId of ["", "abc", "12 34", "1234", "pixel-123456"]) {
      expect(normalizeMetaInput({ datasetId, accessToken: "t", testEventCode: "" }).ok).toBe(false)
    }
  })
})
