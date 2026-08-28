import { describe, it, expect } from "vitest";
import { trapTab } from "./focus-trap";

// No DOM needed: the trap only calls .focus() on whatever it is handed.
function setup() {
  let active: object | null = null;
  const el = (id: string) => ({ id, focus() { active = this; } });
  const a = el("a"), b = el("b"), c = el("c"), outside = el("outside");
  return { list: [a, b, c], a, b, c, outside, get active() { return active; }, set active(v) { active = v; } };
}
const tab = (shiftKey = false) => {
  let prevented = false;
  return { key: "Tab", shiftKey, preventDefault() { prevented = true; }, get prevented() { return prevented; } };
};

describe("trapTab", () => {
  it("steps forward and wraps, including onto a link (the Safari case)", () => {
    const s = setup();
    s.active = s.a;
    trapTab(tab(), s.list, s.active);
    expect(s.active).toBe(s.b);
    trapTab(tab(), s.list, s.active);
    expect(s.active).toBe(s.c);
    trapTab(tab(), s.list, s.active);
    expect(s.active).toBe(s.a);
  });
  it("steps backward from the first to the last", () => {
    const s = setup();
    trapTab(tab(true), s.list, s.a);
    expect(s.active).toBe(s.c);
  });
  it("pulls focus back in when it escaped the dialog", () => {
    const s = setup();
    const e = tab();
    trapTab(e, s.list, s.outside);
    expect(e.prevented).toBe(true);
    expect(s.active).toBe(s.a);
  });
  it("ignores non-Tab keys and empty lists", () => {
    const s = setup();
    const esc = { ...tab(), key: "Escape" };
    trapTab(esc, s.list, s.a);
    expect(s.active).toBe(null);
    trapTab(tab(), [], s.a);
    expect(s.active).toBe(null);
  });
});
