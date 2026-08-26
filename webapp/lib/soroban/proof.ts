// Browser-free Groth16 proof -> Soroban contract-arg encoding. Pure byte/field math: no
// @stellar/stellar-sdk, no browser APIs. This is the ONE shared copy that lib/stellar.ts, the
// server relayer (lib/relayer.ts), and the note-status helper (lib/note-status.ts) all use, so
// the on-chain wire encoding cannot drift between them. G2 uses Soroban's c1||c0 coordinate
// ordering. Do NOT change: these bytes go on-chain.
export type Groth16Proof = { pi_a: any; pi_b: any; pi_c: any; [k: string]: any };

export const fe = (d: string | bigint): string => BigInt(d).toString(16).padStart(64, "0");
export const g1 = (pt: any): string => fe(pt[0]) + fe(pt[1]);
export const g2 = (pt: any): string => fe(pt[0][1]) + fe(pt[0][0]) + fe(pt[1][1]) + fe(pt[1][0]);
export const buf = (hex: string): Uint8Array => Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
export const buf32 = (dec: string | bigint): Uint8Array => buf(BigInt(dec).toString(16).padStart(64, "0"));

// snarkjs proof -> Soroban proof struct
export const scProof = (p: Groth16Proof) => ({ a: buf(g1(p.pi_a)), b: buf(g2(p.pi_b)), c: buf(g1(p.pi_c)) });
