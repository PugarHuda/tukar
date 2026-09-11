import React from "react";
import { Composition } from "remotion";
import { loadFont as loadStencil } from "@remotion/google-fonts/SairaStencilOne";
import { loadFont as loadBarlow } from "@remotion/google-fonts/Barlow";
import { loadFont as loadCourier } from "@remotion/google-fonts/CourierPrime";
import { TukarDemo } from "./Demo";
import { FPS, HEIGHT, TOTAL, WIDTH } from "./timeline";

// The three faces of the parcel world, same families as the app.
loadStencil();
loadBarlow();
loadCourier();

export const RemotionRoot: React.FC = () => (
  <Composition id="TukarDemo" component={TukarDemo} durationInFrames={TOTAL} fps={FPS} width={WIDTH} height={HEIGHT} />
);
