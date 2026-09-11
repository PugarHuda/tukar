import { describe, it, expect, vi, beforeEach } from "vitest";

// The relayer key signs whatever this route submits, so the route must never submit bytes a caller
// handed it: the payload has to come from Circle Iris, keyed by a burn hash.
vi.mock("@/lib/cctp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cctp")>();
  return { ...actual, fetchAttestation: vi.fn(), mintAndForward: vi.fn() };
});

import { POST } from "./route";
import { fetchAttestation, mintAndForward, CCTP } from "@/lib/cctp";

const BURN = "0x" + "ab".repeat(32);
const IRIS = { status: "complete" as const, message: "0x" + "11".repeat(200), attestation: "0x" + "22".repeat(65) };

// A fresh client IP per call so the route's own rate limiter never colours a result.
let n = 0;
const post = async (body: unknown) => {
  const res = await POST(new Request("https://tukar-six.vercel.app/api/cctp/mint", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${(n++ % 250) + 1}` },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  vi.mocked(fetchAttestation).mockReset();
  vi.mocked(mintAndForward).mockReset();
});

describe("POST /api/cctp/mint", () => {
  it("never submits caller-supplied message/attestation bytes", async () => {
    const r = await post({ message: "0x" + "de".repeat(200), attestation: "0x" + "ad".repeat(65) });
    expect(r.status).toBe(400);
    expect(mintAndForward).not.toHaveBeenCalled();
  });

  it("rejects anything that is not a burn tx hash before touching Circle or the relayer", async () => {
    for (const txHash of ["", "0xdead", "not-a-hash", "0x" + "zz".repeat(32)]) {
      expect((await post({ txHash })).status).toBe(400);
    }
    expect(fetchAttestation).not.toHaveBeenCalled();
    expect(mintAndForward).not.toHaveBeenCalled();
  });

  it("submits exactly the payload Circle returned for that burn", async () => {
    vi.mocked(fetchAttestation).mockResolvedValue(IRIS);
    vi.mocked(mintAndForward).mockResolvedValue("stellar-tx-hash");
    const r = await post({ txHash: BURN, message: "0x" + "de".repeat(200), attestation: "0x" + "ad".repeat(65) });
    expect(r).toEqual({ status: 200, body: { txHash: "stellar-tx-hash" } });
    expect(fetchAttestation).toHaveBeenCalledWith(CCTP.evmDomain, BURN);
    // Not the attacker bytes that rode along in the body.
    expect(mintAndForward).toHaveBeenCalledWith(IRIS.message, IRIS.attestation);
  });

  it("signs nothing while Circle has no attestation for the burn", async () => {
    vi.mocked(fetchAttestation).mockResolvedValue({ status: "pending" });
    expect(await post({ txHash: BURN })).toEqual({ status: 202, body: { status: "pending" } });
    expect(mintAndForward).not.toHaveBeenCalled();
  });

  it("signs nothing when Circle is unreachable", async () => {
    vi.mocked(fetchAttestation).mockRejectedValue(new Error("iris responded 503"));
    const r = await post({ txHash: BURN });
    expect(r.status).toBe(502);
    expect(mintAndForward).not.toHaveBeenCalled();
  });
});
