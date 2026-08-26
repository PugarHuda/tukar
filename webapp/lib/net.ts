// fetch with an AbortController-backed timeout. Bounds EXTERNAL calls (anchors, Circle Iris,
// Onramper) so a hung upstream cannot hang our request forever. Same signature as fetch; throws a
// clear timeout error when the request does not complete within `ms` (default 15s).
export async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`Request to ${url} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
