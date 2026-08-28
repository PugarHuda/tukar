import { describe, it, expect, beforeEach } from "vitest";
import { checkCredentialContent } from "./checks";
import { deniedCountries } from "./config";

const NOW = Date.parse("2026-08-27T00:00:00Z");
const approved = {
  approvedAt: "2026-01-01T00:00:00Z",
  expirationDate: "2027-01-01T00:00:00Z",
  credentialSubject: { residentialAddressCountry: "ID", idDocumentCountry: "ID" },
};

describe("checkCredentialContent", () => {
  beforeEach(() => {
    delete process.env.IDOS_DENY_COUNTRIES;
  });

  it("accepts an approved, unexpired credential from an allowed country", () => {
    expect(checkCredentialContent(approved, "", NOW)).toBeNull();
    expect(checkCredentialContent(approved, JSON.stringify({ status: "approved" }), NOW)).toBeNull();
  });

  it("rejects public-notes status other than approved", () => {
    for (const status of ["pending", "rejected", "expired", "revoked"]) {
      expect(checkCredentialContent(approved, JSON.stringify({ status }), NOW)).toMatch(/not approved/);
    }
  });

  it("rejects a credential with no approval record when public notes carry no status", () => {
    const { approvedAt: _a, ...unapproved } = approved;
    expect(checkCredentialContent(unapproved, "", NOW)).toMatch(/no approval record/);
    expect(checkCredentialContent(unapproved, "not json", NOW)).toMatch(/no approval record/);
  });

  it("rejects an expired or unparseable expiry", () => {
    expect(checkCredentialContent({ ...approved, expirationDate: "2026-08-26T23:59:59Z" }, "", NOW)).toMatch(/expired/);
    expect(checkCredentialContent({ ...approved, expirationDate: "soon" }, "", NOW)).toMatch(/expired/);
    expect(checkCredentialContent({ ...approved, expirationDate: undefined }, JSON.stringify({ expirationDate: "2020-01-01" }), NOW)).toMatch(/expired/);
  });

  it("applies the IDOS_DENY_COUNTRIES list (case-insensitive, residency first, then document, then nationality)", () => {
    process.env.IDOS_DENY_COUNTRIES = " kp, IR ";
    expect(deniedCountries()).toEqual(["KP", "IR"]);
    expect(checkCredentialContent(approved, "", NOW)).toBeNull();
    expect(checkCredentialContent({ ...approved, credentialSubject: { residentialAddressCountry: "kp" } }, "", NOW)).toMatch(/not accepted/);
    expect(checkCredentialContent({ ...approved, credentialSubject: { idDocumentCountry: "IR" } }, "", NOW)).toMatch(/not accepted/);
    expect(checkCredentialContent({ ...approved, credentialSubject: { nationality: "IR" } }, "", NOW)).toMatch(/not accepted/);
    // Residency wins over document country when both are present.
    expect(checkCredentialContent({ ...approved, credentialSubject: { residentialAddressCountry: "ID", idDocumentCountry: "IR" } }, "", NOW)).toBeNull();
  });
});
