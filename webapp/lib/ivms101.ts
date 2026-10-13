// IVMS101 (interVASP Messaging Standard 101) builder + validator for the regulator's Travel Rule
// tab. Pure and isomorphic: the browser builds the originator/beneficiary blocks from what the
// operator typed, and the same rules run in vitest. Field names, enums and length limits follow
// the IVMS101 data model (NaturalPerson, NationalIdentification, DateAndPlaceOfBirth, Originator,
// Beneficiary) and its constraints C1 (originator needs an address, customer id, national id or
// date and place of birth), C2 (date of birth in the past) and C3 (ISO 3166-1 alpha-2 country).
import { StrKey } from "@stellar/stellar-sdk";

// ISO 3166-1 alpha-2, all 249 officially assigned codes.
export const ISO3166_ALPHA2 = new Set(
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
    "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
    "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
    "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
    "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
    "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
  ).split(" "),
);

// IVMS101 NationalIdentifierTypeCode, minus LEIX (that one is for legal persons only).
export const NATURAL_ID_TYPES = {
  CCPT: "Passport number",
  IDCD: "Identity card number",
  DRLC: "Driver's licence number",
  SOCS: "Social security number",
  TXID: "Tax identification number",
  ARNU: "Alien registration number",
  FIIN: "Foreign investment identity number",
  RAID: "Registration authority identifier",
  MISC: "Unspecified",
} as const;
export type NaturalIdType = keyof typeof NATURAL_ID_TYPES;

export type PartyInput = {
  primaryName: string; // IVMS101 primaryIdentifier (family name), required
  secondaryName: string; // secondaryIdentifier (given names), optional
  country: string; // countryOfResidence, ISO 3166-1 alpha-2
  account: string; // accountNumber: Stellar G-address or the VASP's account reference
  dateOfBirth: string; // YYYY-MM-DD, optional (with placeOfBirth)
  placeOfBirth: string;
  nationalId: string; // optional (with nationalIdType)
  nationalIdType: string;
  nationalIdCountry: string; // countryOfIssue, optional
};
export const emptyParty = (): PartyInput => ({
  primaryName: "",
  secondaryName: "",
  country: "",
  account: "",
  dateOfBirth: "",
  placeOfBirth: "",
  nationalId: "",
  nationalIdType: "",
  nationalIdCountry: "",
});

export type VaspInput = { name: string; country: string };
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const isCountry = (c: string) => ISO3166_ALPHA2.has(c.trim().toUpperCase());
const tooLong = (s: string, n: number) => s.trim().length > n;

function validDate(d: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Use YYYY-MM-DD.";
  const t = new Date(d + "T00:00:00Z");
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d) return "Not a real calendar date.";
  if (t.getTime() >= now.getTime()) return "Date of birth must be in the past (IVMS101 C2).";
  return null;
}

/** Per-field errors for one party. Empty object = valid. `now` is injectable for tests. */
export function validateParty(p: PartyInput, role: "originator" | "beneficiary", now = new Date()): FieldErrors<PartyInput> {
  const e: FieldErrors<PartyInput> = {};
  if (!p.primaryName.trim()) e.primaryName = "Required (IVMS101 primaryIdentifier).";
  else if (tooLong(p.primaryName, 100)) e.primaryName = "Max 100 characters.";
  if (tooLong(p.secondaryName, 100)) e.secondaryName = "Max 100 characters.";

  if (!p.country.trim()) e.country = "Required.";
  else if (!isCountry(p.country)) e.country = "Not an ISO 3166-1 alpha-2 code (IVMS101 C3).";

  const acct = p.account.trim();
  if (!acct) e.account = "Required (IVMS101 accountNumber).";
  else if (acct.length > 100) e.account = "Max 100 characters.";
  else if (/^G[A-Z2-7]{55}$/.test(acct) && !StrKey.isValidEd25519PublicKey(acct)) e.account = "Stellar address checksum is invalid.";

  const dob = p.dateOfBirth.trim();
  const pob = p.placeOfBirth.trim();
  if (dob || pob) {
    // DateAndPlaceOfBirth is one block: both parts are mandatory inside it.
    if (!dob) e.dateOfBirth = "Required together with place of birth.";
    else {
      const err = validDate(dob, now);
      if (err) e.dateOfBirth = err;
    }
    if (!pob) e.placeOfBirth = "Required together with date of birth.";
    else if (tooLong(pob, 70)) e.placeOfBirth = "Max 70 characters.";
  }

  const nid = p.nationalId.trim();
  if (nid || p.nationalIdType || p.nationalIdCountry.trim()) {
    if (!nid) e.nationalId = "Required when an ID type or issuing country is set.";
    else if (tooLong(nid, 35)) e.nationalId = "Max 35 characters.";
    if (!(p.nationalIdType in NATURAL_ID_TYPES)) e.nationalIdType = "Pick an IVMS101 national identifier type.";
    if (p.nationalIdCountry.trim() && !isCountry(p.nationalIdCountry)) e.nationalIdCountry = "Not an ISO 3166-1 alpha-2 code (IVMS101 C3).";
  }

  // C1: an originator natural person needs geographic address, customer id, national id, or date
  // and place of birth. This form collects the latter two.
  if (role === "originator" && !nid && !(dob && pob)) {
    e.nationalId ??= "IVMS101 C1: the originator needs a national ID or a date and place of birth.";
  }
  return e;
}

/** Errors for a VASP legal person (name + country of registration). */
export function validateVasp(v: VaspInput): FieldErrors<VaspInput> {
  const e: FieldErrors<VaspInput> = {};
  if (!v.name.trim()) e.name = "Required (IVMS101 legalPersonName).";
  else if (tooLong(v.name, 100)) e.name = "Max 100 characters.";
  if (!v.country.trim()) e.country = "Required.";
  else if (!isCountry(v.country)) e.country = "Not an ISO 3166-1 alpha-2 code (IVMS101 C3).";
  return e;
}

/** IVMS101 NaturalPerson from a party. Optional blocks are emitted only when filled. */
export function naturalPerson(p: PartyInput) {
  const nid = p.nationalId.trim();
  const dob = p.dateOfBirth.trim();
  return {
    name: {
      nameIdentifier: [
        {
          primaryIdentifier: p.primaryName.trim(),
          ...(p.secondaryName.trim() ? { secondaryIdentifier: p.secondaryName.trim() } : {}),
          nameIdentifierType: "LEGL",
        },
      ],
    },
    ...(nid
      ? {
          nationalIdentification: {
            nationalIdentifier: nid,
            nationalIdentifierType: p.nationalIdType,
            ...(p.nationalIdCountry.trim() ? { countryOfIssue: p.nationalIdCountry.trim().toUpperCase() } : {}),
          },
        }
      : {}),
    ...(dob ? { dateAndPlaceOfBirth: { dateOfBirth: dob, placeOfBirth: p.placeOfBirth.trim() } } : {}),
    countryOfResidence: p.country.trim().toUpperCase(),
  };
}

/** IVMS101 Originator and Beneficiary blocks (persons + account numbers). */
export function buildParties(originator: PartyInput, beneficiary: PartyInput) {
  return {
    originator: {
      originatorPersons: [{ naturalPerson: naturalPerson(originator) }],
      accountNumber: [originator.account.trim()],
    },
    beneficiary: {
      beneficiaryPersons: [{ naturalPerson: naturalPerson(beneficiary) }],
      accountNumber: [beneficiary.account.trim()],
    },
  };
}

/** IVMS101 legalPerson for a VASP. An LEI goes in as nationalIdentification type LEIX (no countryOfIssue). */
export function vaspLegalPerson(v: VaspInput, lei?: string) {
  return {
    name: { nameIdentifier: [{ legalPersonName: v.name.trim(), legalPersonNameIdentifierType: "LEGL" }] },
    countryOfRegistration: v.country.trim().toUpperCase(),
    ...(lei ? { nationalIdentification: { nationalIdentifier: lei, nationalIdentifierType: "LEIX" } } : {}),
  };
}
