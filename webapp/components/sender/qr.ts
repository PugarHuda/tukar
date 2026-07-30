// QR rendering for the Sender success screen. The bearer note is ~470 bytes, which needs a
// full byte-mode QR encoder (Reed-Solomon + version/mask selection). Rather than hand-write
// and hope the RS tables are transcribed correctly (a wrong QR is worse than none), we load
// the tiny, battle-tested `qrcode-generator` UMD at runtime and build a themed SVG from its
// module grid. The copyable claim string + /receiver link remain the source of truth, so if
// this fails to load the UI degrades to "copy the string" — nothing money-critical rides on it.
// ponytail: runtime CDN script (not an npm dep — package.json is out of scope, and Next can't
// build-time import a URL). Upgrade path: vendor qrcode-generator into public/ if offline QR matters.

const CDN = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";

let _lib: Promise<any> | null = null;
function loadQrLib(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).qrcode) return Promise.resolve((window as any).qrcode);
  if (_lib) return _lib;
  _lib = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN;
    s.async = true;
    s.onload = () => ((window as any).qrcode ? resolve((window as any).qrcode) : reject(new Error("qr lib missing")));
    s.onerror = () => {
      _lib = null; // allow a later retry
      reject(new Error("qr lib failed to load"));
    };
    document.head.appendChild(s);
  });
  return _lib;
}

/** Encode `text` as a themed SVG string (dark modules on a pale box). Throws if the lib can't load. */
export async function qrSvgString(text: string, dark = "#0a0705", light = "#f3ad79"): Promise<string> {
  const qrcode = await loadQrLib();
  const qr = qrcode(0, "L"); // auto version, ECC level L (max data capacity)
  qr.addData(text);
  qr.make();
  const n: number = qr.getModuleCount();
  const margin = 2;
  const size = n + margin * 2;
  let rects = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" ` +
    `width="100%" height="100%" role="img" aria-label="Claim note QR code">` +
    `<rect width="${size}" height="${size}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`
  );
}
