import { describe, it, expect, vi, beforeEach } from "vitest";

// The cron only REMINDS: for each due plan it pushes "your send is due" to the owner's subscribed
// browsers. It never pulls, deposits or signs anything. Store, oracle and push transport are mocked
// at their module boundary; the route's own decision logic runs for real.
const OWNER = "G" + "A".repeat(55);
const file = vi.hoisted(() => ({ current: null as any }));
const pushed = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ withMonitor: (_: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/soroban/oracle", () => ({ readReflectorFx: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPush: pushed.send }));
vi.mock("@/lib/schedules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedules")>();
  return {
    ...actual,
    isConfigured: () => true,
    listAllOwners: async () => [OWNER],
    readOwnerFile: async () => structuredClone(file.current),
    writeOwnerFile: vi.fn(async (_o: string, f: any) => {
      file.current = structuredClone(f);
    }),
  };
});

import { GET } from "./route";
import { readReflectorFx } from "@/lib/soroban/oracle";

const SECRET = "cron-secret-0123456789";
const call = async () => {
  const res = await GET(new Request("https://x/api/cron/recurring", { headers: { authorization: `Bearer ${SECRET}` } }));
  return { status: res.status, body: await res.json() };
};
const today = new Date().toISOString().slice(0, 10);
const plan = (extra: object = {}) => ({ id: "p1", amount: "10", code: "MX", recipient: "Ana", frequency: "weekly", nextDate: today, history: [], ...extra });
const SUB = { endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } };

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.WEB_PUSH_PRIVATE_KEY = "priv";
  process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "pub";
  pushed.send.mockReset().mockResolvedValue(undefined);
  vi.mocked(readReflectorFx).mockReset();
  file.current = { plans: [plan(), plan({ id: "later", nextDate: "2999-01-01" })], guard: {}, subs: [SUB] };
});

describe("GET /api/cron/recurring (reminders only)", () => {
  it("rejects a missing or wrong bearer", async () => {
    const res = await GET(new Request("https://x/api/cron/recurring", { headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });

  it("pushes a reminder for the due plan that opens /sender with the plan prefilled, and moves nothing", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ configured: true, due: 1, reminded: 1, held: 0 });
    expect(pushed.send).toHaveBeenCalledTimes(1);
    const [sub, payload] = pushed.send.mock.calls[0];
    expect(sub).toEqual(SUB);
    expect(JSON.parse(payload)).toMatchObject({ url: "/sender#plan=p1", kind: "plan", title: "Your scheduled send is due" });
    // The plan stays due until the owner signs the send and marks it done; no receipt is invented.
    expect(file.current.plans[0]).toMatchObject({ nextDate: today, history: [] });
  });

  it("has no money-moving dependency at all", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8"));
    expect(src).not.toMatch(/@\/lib\/relayer|Keypair|RELAYER_SECRET|signTransaction|sendTx/);
  });

  it("holds the reminder (skip receipt, still due) while the rate condition is not met", async () => {
    file.current.plans[0] = plan({ condition: { symbol: "MXN", minRate: 20 } });
    vi.mocked(readReflectorFx).mockResolvedValue({ rate: 18.5 } as any);
    const r = await call();
    expect(r.body).toMatchObject({ due: 1, reminded: 0, held: 1 });
    expect(pushed.send).not.toHaveBeenCalled();
    expect(file.current.plans[0].history[0]).toMatchObject({ skipped: expect.stringMatching(/rate below minimum/), observedRate: 18.5 });
    expect(file.current.plans[0].nextDate).toBe(today);
  });

  it("counts an owner with no subscription (they get the due banner on /sender) and drops a gone subscription", async () => {
    file.current.subs = [];
    expect((await call()).body).toMatchObject({ due: 1, reminded: 0, noSubscription: 1 });

    file.current.subs = [SUB];
    pushed.send.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect((await call()).body).toMatchObject({ reminded: 0, failed: 1 });
    expect(file.current.subs).toEqual([]);
  });
});
