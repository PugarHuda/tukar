import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { ISO3166_ALPHA2, buildParties, emptyParty, validateParty, validateVasp, vaspLegalPerson, type PartyInput } from "./ivms101";

const NOW = new Date("2026-10-13T00:00:00Z");
const G = Keypair.random().publicKey();
const party = (o: Partial<PartyInput> = {}): PartyInput => ({ ...emptyParty(), primaryName: "Santos", country: "PH", account: G, ...o });

describe("ivms101 validator", () => {
  it("has all 249 ISO 3166-1 alpha-2 codes", () => {
    expect(ISO3166_ALPHA2.size).toBe(249);
  });

  it("accepts a minimal beneficiary and rejects empty required fields", () => {
    expect(validateParty(party(), "beneficiary", NOW)).toEqual({});
    const e = validateParty(emptyParty(), "beneficiary", NOW);
    expect(Object.keys(e).sort()).toEqual(["account", "country", "primaryName"]);
  });

  it("enforces C1 on the originator only", () => {
    expect(validateParty(party(), "originator", NOW).nationalId).toMatch(/C1/);
    expect(validateParty(party({ nationalId: "P1234567", nationalIdType: "CCPT" }), "originator", NOW)).toEqual({});
    expect(validateParty(party({ dateOfBirth: "1990-02-28", placeOfBirth: "Manila" }), "originator", NOW)).toEqual({});
  });

  it("enforces C3 country codes, C2 past dates and paired DOB fields", () => {
    expect(validateParty(party({ country: "XX" }), "beneficiary", NOW).country).toMatch(/C3/);
    expect(validateParty(party({ country: "ph" }), "beneficiary", NOW)).toEqual({});
    expect(validateParty(party({ dateOfBirth: "2030-01-01", placeOfBirth: "Manila" }), "beneficiary", NOW).dateOfBirth).toMatch(/C2/);
    expect(validateParty(party({ dateOfBirth: "1990-02-30", placeOfBirth: "Manila" }), "beneficiary", NOW).dateOfBirth).toMatch(/calendar/);
    expect(validateParty(party({ dateOfBirth: "1990-01-01" }), "beneficiary", NOW).placeOfBirth).toBeTruthy();
    expect(validateParty(party({ nationalId: "X1", nationalIdType: "LEIX" }), "beneficiary", NOW).nationalIdType).toBeTruthy();
  });

  it("rejects a Stellar address with a bad checksum but accepts other account refs", () => {
    const bad = G.slice(0, -1) + (G.endsWith("A") ? "B" : "A");
    expect(validateParty(party({ account: bad }), "beneficiary", NOW).account).toMatch(/checksum/);
    expect(validateParty(party({ account: "IBAN DE89370400440532013000" }), "beneficiary", NOW)).toEqual({});
  });

  it("validates VASPs", () => {
    expect(validateVasp({ name: "Acme VASP", country: "US" })).toEqual({});
    expect(Object.keys(validateVasp({ name: "", country: "ZZ" })).sort()).toEqual(["country", "name"]);
  });
});

describe("ivms101 builder", () => {
  it("builds IVMS101 originator/beneficiary blocks with only the filled optional parts", () => {
    const o = party({ secondaryName: " Maria ", nationalId: "P1234567", nationalIdType: "CCPT", nationalIdCountry: "ph" });
    const b = party({ primaryName: "Reyes", country: "id", account: "acct-77" });
    const out = buildParties(o, b);
    expect(out.originator).toEqual({
      originatorPersons: [
        {
          naturalPerson: {
            name: { nameIdentifier: [{ primaryIdentifier: "Santos", secondaryIdentifier: "Maria", nameIdentifierType: "LEGL" }] },
            nationalIdentification: { nationalIdentifier: "P1234567", nationalIdentifierType: "CCPT", countryOfIssue: "PH" },
            countryOfResidence: "PH",
          },
        },
      ],
      accountNumber: [G],
    });
    expect(out.beneficiary.beneficiaryPersons[0].naturalPerson).toEqual({
      name: { nameIdentifier: [{ primaryIdentifier: "Reyes", nameIdentifierType: "LEGL" }] },
      countryOfResidence: "ID",
    });
    expect(out.beneficiary.accountNumber).toEqual(["acct-77"]);
  });

  it("stamps an LEI as LEIX on the VASP legal person", () => {
    expect(vaspLegalPerson({ name: " Acme ", country: "us" }, "635400JAHDSBACQGBS84")).toEqual({
      name: { nameIdentifier: [{ legalPersonName: "Acme", legalPersonNameIdentifierType: "LEGL" }] },
      countryOfRegistration: "US",
      nationalIdentification: { nationalIdentifier: "635400JAHDSBACQGBS84", nationalIdentifierType: "LEIX" },
    });
  });
});
