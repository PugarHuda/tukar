"use client";

import { useEffect, useRef } from "react";

// Brand palette shared by the hero / grid / globe canvases. [stroke, hot tip, deep]
export const PAL = ["#ff8a3d", "#ffd29a", "#ff6a18"] as const;

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

type CanvasCtl = { resize: () => void; frame: (now: number) => void };

// Drives a canvas requestAnimationFrame loop the way frontend/landing.js did:
// draws the first frame synchronously, pauses when the tab is hidden, and
// respects prefers-reduced-motion (keeps the static first frame, no loop).
// `init` sets up closures over the 2D context and returns { resize, frame };
// `frame` must NOT schedule its own rAF — this hook owns the loop.
export function useCanvasAnimation(
  init: (ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement) => CanvasCtl,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const initRef = useRef(init);
  initRef.current = init;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const { resize, frame } = initRef.current(ctx, cv);

    let raf = 0;
    const loop = (now: number) => {
      frame(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && !reduced) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const onVis = () => {
      if (document.hidden || reduced) stop();
      else start();
    };
    const onResize = () => resize();

    resize();
    frame(performance.now()); // first frame synchronously
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    start();

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return ref;
}
