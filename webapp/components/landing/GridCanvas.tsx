"use client";

import { PAL, hexA, useCanvasAnimation } from "./useCanvasAnimation";

// COMMITMENT GRID — cells light up in a travelling wave.
// Faithful port of initGrid() from frontend/landing.js.
export function GridCanvas() {
  const ref = useCanvasAnimation((ctx, cv) => {
    let W = 0;
    let H = 0;
    let dpr = 1;
    let cols = 7;
    let rows = 4;
    let cell = 0;
    let gap = 0;
    let ox = 0;
    let oy = 0;

    function rr(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.max(1, W * dpr);
      cv.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = 7;
      gap = Math.min(W, H) * 0.03;
      cell = (W - gap * (cols + 1)) / cols;
      rows = Math.max(4, Math.floor((H - gap) / (cell + gap)));
      ox = gap;
      oy = gap;
    }

    const t0 = performance.now();

    function frame(now: number) {
      const time = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + c * (cell + gap);
          const y = oy + r * (cell + gap);
          const d = c * 0.7 + r;
          const phase = time * 1.05 - d * 0.3;
          const period = 3.4;
          const pf = phase - Math.floor(phase / period) * period;
          let glow = pf < 1 ? Math.sin(pf * Math.PI) : 0;
          glow = Math.max(0, glow);
          rr(x, y, cell, cell, cell * 0.2);
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.lineWidth = 1;
          ctx.stroke();
          if (glow > 0.02) {
            ctx.save();
            ctx.shadowColor = hexA(PAL[0], 0.8 * glow);
            ctx.shadowBlur = 20 * glow;
            rr(x, y, cell, cell, cell * 0.2);
            ctx.fillStyle = hexA(PAL[2], 0.12 + 0.5 * glow);
            ctx.fill();
            ctx.strokeStyle = hexA(PAL[0], 0.3 + 0.6 * glow);
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    return { resize, frame };
  });

  return <canvas id="gridCanvas" ref={ref} aria-hidden="true" />;
}
