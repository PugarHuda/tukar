// Serverless feasibility probe: confirms Vercel deploys a root /api function
// alongside the static webapp/out build. Safe to remove once verified.
export default function handler(req, res) {
  res.status(200).json({ ok: true, note: "api route live alongside static build" });
}
