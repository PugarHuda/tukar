// SEP-12 KYC status against the anchor's KYC_SERVER (discovered via SEP-1). The testanchor's
// customer flow is a TEST STUB: verified live 2026-08-29, GET /customer answers NEEDS_INFO with
// first_name, last_name, email_address required; a PUT with those three returns 202 {id} and the
// next GET is ACCEPTED at once, with no review. Copy in the UI says so. Against a licensed anchor
// the same two calls are the real onboarding: statuses move NEEDS_INFO -> PROCESSING -> ACCEPTED.
import { fetchWithTimeout } from "./net";
import { anchorJson } from "./sep38";

export type KycField = { name: string; description: string; type: string; optional: boolean; choices: string[] };
export type KycStatus = "not_started" | "needs_info" | "pending" | "accepted" | "rejected";
export type Kyc = {
  id: string | null;
  status: KycStatus;
  raw: string; // the anchor's own status word, kept for the receipt
  required: KycField[]; // fields the anchor still needs (optional=false), empty once accepted
  message: string | null;
};

// Pure: SEP-12 GET /customer body -> Kyc. NEEDS_INFO with no id means the anchor has never seen
// this account (not started); with an id it has a record but wants more.
export function mapKyc(json: any): Kyc {
  const raw = String(json?.status || "").toUpperCase();
  const id = json?.id ? String(json.id) : null;
  const fields = json?.fields && typeof json.fields === "object" ? json.fields : {};
  const required: KycField[] = Object.entries(fields)
    .filter(([, f]: [string, any]) => f && f.optional === false)
    .map(([name, f]: [string, any]) => ({ name, description: String(f.description || name), type: String(f.type || "string"), optional: false, choices: Array.isArray(f.choices) ? f.choices : [] }));
  const status: KycStatus =
    raw === "ACCEPTED" ? "accepted" : raw === "REJECTED" ? "rejected" : raw === "PROCESSING" ? "pending" : id ? "needs_info" : "not_started";
  return { id, status, raw, required: status === "accepted" ? [] : required, message: json?.message ? String(json.message) : null };
}

export async function getKycStatus(server: string, token: string, type?: string): Promise<Kyc> {
  const q = type ? `?type=${encodeURIComponent(type)}` : "";
  const res = await fetchWithTimeout(`${server}/customer${q}`, { headers: { Authorization: `Bearer ${token}` } }, 15000);
  return mapKyc(await anchorJson(res, "SEP-12 customer status"));
}

export async function putKycFields(server: string, token: string, fields: Record<string, string>, type?: string): Promise<{ id: string }> {
  const res = await fetchWithTimeout(
    `${server}/customer`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(type ? { ...fields, type } : fields),
    },
    15000,
  );
  const body = await anchorJson(res, "SEP-12 customer update");
  if (!body?.id) throw new Error("SEP-12 customer update: anchor returned no customer id");
  return { id: String(body.id) };
}
