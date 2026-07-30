"use client";

import { PAL, hexA, useCanvasAnimation } from "./useCanvasAnimation";

// GLOBE — night Earth, warm city lights, cross-border arcs.
// Faithful port of initGlobe() from frontend/landing.js.
type Vec = { x: number; y: number; z: number };

export function GlobeCanvas() {
  const ref = useCanvasAnimation((ctx, cv) => {
    let W = 0;
    let H = 0;
    let dpr = 1;
    let cx = 0;
    let cy = 0;
    let R = 0;
    let rot = 0;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.max(1, W * dpr);
      cv.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W * 0.5;
      cy = H * 0.5;
      R = Math.min(W, H) * 0.47;
    }

    const D2R = Math.PI / 180;
    function toV(lat: number, lon: number): Vec {
      return { x: Math.cos(lat) * Math.sin(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.cos(lon) };
    }
    const CONTINENTS: number[][][] = [
      [[71, -156], [70, -128], [60, -95], [55, -80], [52, -56], [47, -53], [45, -66], [41, -70], [37, -76], [30, -81], [25, -81], [18, -95], [15, -92], [20, -105], [30, -114], [40, -124], [48, -125], [55, -130], [62, -150]],
      [[81, -30], [78, -18], [70, -22], [61, -46], [72, -58], [80, -45]],
      [[12, -72], [10, -61], [4, -52], [-5, -35], [-12, -38], [-23, -43], [-34, -54], [-50, -69], [-40, -73], [-30, -71], [-18, -70], [-4, -81], [6, -78]],
      [[37, -6], [34, 11], [31, 25], [30, 33], [15, 40], [11, 51], [-1, 42], [-16, 40], [-26, 34], [-34, 20], [-29, 16], [-12, 13], [-1, 9], [5, -4], [15, -17], [21, -17], [28, -13], [34, -9]],
      [[60, -9], [64, 12], [70, 28], [60, 32], [50, 28], [45, 33], [40, 20], [37, 15], [36, -5], [43, -9], [48, -5], [54, -8]],
      [[60, 30], [70, 55], [76, 95], [73, 140], [66, 170], [60, 160], [52, 140], [45, 132], [39, 127], [31, 122], [22, 109], [10, 105], [8, 98], [16, 95], [22, 90], [20, 80], [8, 77], [18, 72], [24, 67], [30, 58], [37, 48], [40, 52], [48, 52], [54, 40]],
      [[-11, 131], [-12, 142], [-19, 147], [-28, 154], [-38, 147], [-38, 140], [-33, 123], [-31, 115], [-22, 114], [-14, 127]],
    ];
    function onLand(lonD: number, latD: number): boolean {
      for (let p = 0; p < CONTINENTS.length; p++) {
        const poly = CONTINENTS[p];
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
          if (((yi > latD) !== (yj > latD)) && (lonD < ((xj - xi) * (latD - yi)) / (yj - yi) + xi)) inside = !inside;
        }
        if (inside) return true;
      }
      return false;
    }
    const dots: { x: number; y: number; z: number; land: boolean }[] = [];
    for (let latD = -84; latD <= 84; latD += 3.2) {
      const rr2 = Math.cos(latD * D2R);
      const step = 3.2 / Math.max(0.18, rr2);
      for (let lonD = -180; lonD < 180; lonD += step) {
        const v = toV(latD * D2R, lonD * D2R);
        dots.push({ x: v.x, y: v.y, z: v.z, land: onLand(lonD, latD) });
      }
    }
    const CITY_LL: number[][] = [
      [40.7, -74], [34, -118], [41.8, -87.6], [19.4, -99], [43.7, -79.4], [25.8, -80.2], [45.5, -73.6], [37.8, -122.4], [29.8, -95.4], [49.3, -123.1],
      [-23.5, -46.6], [-34.6, -58.4], [-12, -77], [4.7, -74], [-33.4, -70.7], [10.5, -66.9],
      [51.5, -0.1], [48.9, 2.3], [40.4, -3.7], [52.5, 13.4], [41.9, 12.5], [55.8, 37.6], [41, 28.9], [59.3, 18.1], [52.2, 21], [50.1, 8.7], [45.5, 9.2],
      [6.5, 3.4], [30, 31.2], [-26.2, 28], [-1.3, 36.8], [33.6, -7.6], [14.7, -17.4], [9, 38.7],
      [25.2, 55.3], [24.7, 46.7], [35.7, 51.4], [31.8, 35.2],
      [19, 72.8], [28.6, 77.2], [1.35, 103.8], [-6.2, 106.8], [13.7, 100.5], [22.3, 114.2], [31.2, 121.5], [39.9, 116.4], [35.7, 139.7], [37.6, 127], [14.6, 121], [23.8, 90.4],
      [-33.9, 151.2], [-37.8, 145], [-36.8, 174.8],
    ];
    const CITIES = CITY_LL.map((c) => ({
      v: toV(c[0] * D2R, c[1] * D2R),
      s: 0.6 + Math.random() * 0.9,
      ph: Math.random() * 6.28,
    }));
    function slerp(a: Vec, b: Vec, t: number): Vec {
      let d = a.x * b.x + a.y * b.y + a.z * b.z;
      d = Math.max(-1, Math.min(1, d));
      const o = Math.acos(d);
      if (o < 1e-4) return a;
      const s = Math.sin(o);
      const k1 = Math.sin((1 - t) * o) / s;
      const k2 = Math.sin(t * o) / s;
      return { x: a.x * k1 + b.x * k2, y: a.y * k1 + b.y * k2, z: a.z * k1 + b.z * k2 };
    }
    function mkArc() {
      const i = Math.floor(Math.random() * CITIES.length);
      let j = Math.floor(Math.random() * CITIES.length);
      if (j === i) j = (j + 1) % CITIES.length;
      return { a: CITIES[i].v, b: CITIES[j].v, head: Math.random() * 0.4 };
    }
    const pairs = [mkArc(), mkArc(), mkArc(), mkArc(), mkArc()];

    function frame() {
      rot += 0.0016;
      ctx.clearRect(0, 0, W, H);
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      const oc = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.4, R * 0.1, cx, cy, R);
      oc.addColorStop(0, "rgba(44,35,34,0.99)");
      oc.addColorStop(0.55, "rgba(23,18,18,1)");
      oc.addColorStop(1, "rgba(9,6,7,1)");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.fillStyle = oc;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.clip();
      for (let k = 0; k < dots.length; k++) {
        const d = dots[k];
        const x = d.x * cosR + d.z * sinR;
        const z = -d.x * sinR + d.z * cosR;
        if (z <= 0.03) continue;
        const sx = cx + R * x;
        const sy = cy - R * d.y;
        if (d.land) {
          ctx.beginPath();
          ctx.arc(sx, sy, 1.15, 0, 7);
          ctx.fillStyle = "rgba(200,151,101," + (0.13 + 0.52 * z) + ")";
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, 0.72, 0, 7);
          ctx.fillStyle = "rgba(128,116,118," + (0.03 + 0.07 * z) + ")";
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "lighter";
      for (let ci = 0; ci < CITIES.length; ci++) {
        const c = CITIES[ci];
        const cv2 = c.v;
        const x2 = cv2.x * cosR + cv2.z * sinR;
        const z2 = -cv2.x * sinR + cv2.z * cosR;
        if (z2 <= 0.04) continue;
        const sx2 = cx + R * x2;
        const sy2 = cy - R * cv2.y;
        const tw = 0.78 + 0.22 * Math.sin(rot * 22 + c.ph);
        const a2 = (0.3 + 0.7 * z2) * tw;
        const rad = c.s * (1.0 + 1.05 * z2);
        const gl = ctx.createRadialGradient(sx2, sy2, 0, sx2, sy2, rad * 4.2);
        gl.addColorStop(0, "rgba(255,214,150," + Math.min(1, a2) + ")");
        gl.addColorStop(0.4, "rgba(255,150,60," + a2 * 0.4 + ")");
        gl.addColorStop(1, "rgba(255,140,40,0)");
        ctx.beginPath();
        ctx.arc(sx2, sy2, rad * 4.2, 0, 7);
        ctx.fillStyle = gl;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx2, sy2, rad * 0.6, 0, 7);
        ctx.fillStyle = "rgba(255,240,212," + Math.min(1, a2) + ")";
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      const term = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
      term.addColorStop(0, "rgba(0,0,0,0)");
      term.addColorStop(0.5, "rgba(0,0,0,0.05)");
      term.addColorStop(1, "rgba(6,4,5,0.55)");
      ctx.fillStyle = term;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      // soft edge fade (no hard rim)
      ctx.globalCompositeOperation = "destination-out";
      const fade = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.02);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,1)");
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.02, 0, 7);
      ctx.fillStyle = fade;
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.08);
      halo.addColorStop(0, "rgba(255,150,80,0)");
      halo.addColorStop(0.72, "rgba(255,140,70,0.12)");
      halo.addColorStop(1, "rgba(255,140,70,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.08, 0, 7);
      ctx.fillStyle = halo;
      ctx.fill();

      // arcs
      for (let pi = 0; pi < pairs.length; pi++) {
        const p = pairs[pi];
        p.head += 0.005;
        if (p.head > 1.4) {
          const na = mkArc();
          p.a = na.a;
          p.b = na.b;
          p.head = 0;
        }
        const N = 42;
        for (let ii = 0; ii < N; ii++) {
          const sN = ii / (N - 1);
          const seg = p.head - sN * 0.5;
          if (seg < 0 || seg > 1) continue;
          const m = slerp(p.a, p.b, seg);
          const lift = 1 + 0.2 * Math.sin(Math.PI * seg);
          const vx = m.x * lift, vy = m.y * lift, vz = m.z * lift;
          const ax = vx * cosR + vz * sinR;
          const az = -vx * sinR + vz * cosR;
          const aa = (1 - sN) * (az > 0 ? 1 : 0.22);
          if (aa <= 0.01) continue;
          ctx.beginPath();
          ctx.arc(cx + R * ax, cy - R * vy, ii === 0 ? 2.6 : 1.5, 0, 7);
          ctx.fillStyle = hexA(ii === 0 ? PAL[1] : PAL[0], aa);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }

    return { resize, frame };
  });

  return <canvas id="globeCanvas" ref={ref} aria-hidden="true" />;
}
