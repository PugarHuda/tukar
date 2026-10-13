import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// No real RPC / TRISA calls from a unit test.
vi.mock("@/lib/net", () => ({ fetchWithTimeout: vi.fn().mockRejectedValue(new Error("offline")) }));

import { GET } from "./route";

const KEYS = ["RELAYER_SECRET", "STELLAR_RELAYER_SECRET", "SPONSOR_SECRET"];
let n = 0;
const get = async () => (await GET(new Request("https://tukar-six.vercel.app/api/health", { headers: { "x-forwarded-for": `203.0.113.${(n++ % 250) + 1}` } }))).json();

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("GET /api/health", () => {
  it("reports no server fund keys and no relayer/sponsor checks", async () => {
    const h = await get();
    expect(h.serverHoldsFundKeys).toBe(false);
    expect(h.unusedSecrets).toEqual([]);
    for (const k of ["relayer", "cctpRelayer", "sponsor"]) {
      expect(h.checks).not.toHaveProperty(k);
      expect(h.missing).not.toHaveProperty(k);
    }
    expect(h.checks.schedules).toBe(h.checks.schedulesStore && h.checks.auth);
  });

  it("names a leftover fund-key env var (never its value) so the operator can delete it", async () => {
    process.env.SPONSOR_SECRET = "SXXXXSECRETVALUE";
    const h = await get();
    expect(h.unusedSecrets).toEqual(["SPONSOR_SECRET"]);
    expect(h.serverHoldsFundKeys).toBe(false);
    expect(JSON.stringify(h)).not.toContain("SXXXXSECRETVALUE");
  });

  // serverHoldsFundKeys is a constant false: this keeps it honest by failing if any non-test source
  // under app/ or lib/ reads one of those env vars again.
  it("no app/ or lib/ source reads a retired fund-key env var", () => {
    const root = join(__dirname, "..", "..", "..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(join(root, "app"));
    walk(join(root, "lib"));
    const read = new RegExp(`env(\\.|\\[["'])(${KEYS.join("|")})\\b`);
    const hits = files.filter((f) => read.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => relative(root, f).split(sep).join("/"))).toEqual([]);
  });
});
