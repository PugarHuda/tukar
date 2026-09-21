import React from "react";
import { Composition } from "remotion";
import { loadFont as loadStencil } from "@remotion/google-fonts/SairaStencilOne";
import { loadFont as loadBarlow } from "@remotion/google-fonts/Barlow";
import { loadFont as loadCourier } from "@remotion/google-fonts/CourierPrime";
import { TukarDemo } from "./Demo";
import { FPS, HEIGHT, TOTAL, WIDTH } from "./timeline";
import { TukarTeam } from "./Team";
import { TEAM_FPS, TEAM_TOTAL } from "./teamTimeline";

// The three faces of the parcel world, same families as the app.
loadStencil();
loadBarlow();
loadCourier();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="TukarDemo" component={TukarDemo} durationInFrames={TOTAL} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="TukarTeam" component={TukarTeam} durationInFrames={TEAM_TOTAL} fps={TEAM_FPS} width={1920} height={1080} />
  </>
);
