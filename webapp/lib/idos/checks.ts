// Pure content checks on a signature-verified idOS credential (no SDK, no env beyond the deny list),
// kept out of consumer.server.ts so vitest can exercise them directly.
import { deniedCountries } from "./config";

// Returns the first failing reason, else null. public_notes is the issuer's public status record
// ({status,...}); when the shared copy carries none, the signed content's own approvedAt and
// expirationDate decide. Country checks read the subject's residency, then document country, then
// nationality (whichever the issuer filled).
export function checkCredentialContent(credential: any, publicNotes: string, now = Date.now()): string | null {
  let notes: any = null;
  try {
    notes = publicNotes ? JSON.parse(publicNotes) : null;
  } catch {
    notes = null;
  }
  const status = typeof notes?.status === "string" ? notes.status.toLowerCase() : "";
  if (status && status !== "approved") return `Credential status is ${status}, not approved`;
  if (!status && !credential?.approvedAt) return "Credential has no approval record";

  const expiry = credential?.expirationDate ?? notes?.expirationDate;
  if (expiry) {
    const t = Date.parse(String(expiry));
    if (Number.isNaN(t) || t <= now) return "Credential has expired";
  }

  const subj = credential?.credentialSubject ?? {};
  const country = String(subj.residentialAddressCountry || subj.idDocumentCountry || subj.nationality || "").toUpperCase();
  if (country && deniedCountries().includes(country)) return "Credential residency is not accepted on this corridor";
  return null;
}
