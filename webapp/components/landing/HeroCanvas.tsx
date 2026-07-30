"use client";

import { PAL, hexA, useCanvasAnimation } from "./useCanvasAnimation";

// HERO — light streaks accelerating from a vanishing point.
// Faithful port of initHero() from frontend/landing.js.
type P = { x: number; y: number };
type Lane = { F: P; C: P; E: P };
type Streak = { li: number; t: number; v: number; len: number; b: number; cool: boolean; delay: number };

export function HeroCanvas() {
  const ref = useCanvasAnimation((ctx, cv) => {
    let W = 0;
    let H = 0;
    let dpr = 1;
    let F: P = { x: 0, y: 0 };
    let lanes: Lane[] = [];

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || cv.parentElement!.clientWidth;
      H = cv.clientHeight || cv.parentElement!.clientHeight;
      cv.width = Math.max(1, W * dpr);
      cv.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      F = { x: W * 0.6, y: H * 0.36 };
      const exits = [
        [-0.12, 1.05], [0.1, 1.12], [0.28, 1.12], [0.46, 1.12], [0.64, 1.12],
        [0.84, 1.08], [1.06, 0.92], [1.12, 0.66], [1.1, 0.44], [-0.06, 0.86], [-0.1, 0.64],
      ];
      lanes = exits.map((e) => {
        const E = { x: e[0] * W, y: e[1] * H };
        const C = { x: F.x + (E.x - F.x) * 0.12, y: F.y + (E.y - F.y) * 0.5 };
        return { F, C, E };
      });
    }

    function B(l: Lane, t: number): P {
      const u = 1 - t;
      return {
        x: u * u * l.F.x + 2 * u * t * l.C.x + t * t * l.E.x,
        y: u * u * l.F.y + 2 * u * t * l.C.y + t * t * l.E.y,
      };
    }
    function spawn(): Streak {
      return {
        li: Math.floor(Math.random() * lanes.length),
        t: Math.random() * 0.12,
        v: 0.0045 + Math.random() * 0.006,
        len: 0.05 + Math.random() * 0.07,
        b: 0.5 + Math.random() * 0.5,
        cool: Math.random() < 0.13,
        delay: Math.random() * 0.45,
      };
    }

    const streaks: Streak[] = [];
    let last = performance.now();
    const TARGET = window.innerWidth < 720 ? 70 : 120;

    function frame(now: number) {
      const dt = Math.min(40, now - last);
      last = now;
      while (streaks.length < TARGET) streaks.push(spawn());
      if (streaks.length > TARGET) streaks.length = TARGET;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(10,7,5,0.30)";
      ctx.fillRect(0, 0, W, H);

      const g = ctx.createRadialGradient(F.x, F.y, 0, F.x, F.y, Math.max(W, H) * 0.55);
      g.addColorStop(0, "rgba(255,165,90,0.18)");
      g.addColorStop(0.16, "rgba(220,110,40,0.08)");
      g.addColorStop(0.45, "rgba(120,50,15,0.025)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        if (s.delay > 0) {
          s.delay -= dt / 1000;
          continue;
        }
        s.t += (s.v + s.t * s.t * 0.06) * (dt / 16.67);
        if (s.t >= 1) {
          streaks[i] = spawn();
          continue;
        }
        const l = lanes[s.li];
        const p2 = B(l, s.t);
        const p1 = B(l, Math.max(0, s.t - s.len * (1 + s.t * 7)));
        const w = 0.5 + s.t * s.t * 6.5;
        const fade = s.t < 0.1 ? s.t / 0.1 : s.t > 0.85 ? (1 - s.t) / 0.15 : 1;
        const a = Math.max(0, Math.min(1, s.b * fade));
        const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
        if (s.cool) {
          grad.addColorStop(0, "rgba(180,185,200,0)");
          grad.addColorStop(1, "rgba(205,210,225," + a * 0.5 + ")");
        } else {
          grad.addColorStop(0, hexA(PAL[2], 0));
          grad.addColorStop(0.6, hexA(PAL[0], a * 0.85));
          grad.addColorStop(1, hexA(PAL[1], a));
        }
        ctx.strokeStyle = grad;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    return { resize, frame };
  });

  return <canvas id="heroCanvas" ref={ref} aria-hidden="true" />;
}
