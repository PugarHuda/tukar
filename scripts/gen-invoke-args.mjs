// Emit the two files the stellar CLI expects for `verify`:
//   soroban_proof.json   -> { "a": <128 hex>, "b": <256 hex>, "c": <128 hex> }  (no 0x)
//   soroban_public.json  -> ["<decimal>", ...]  (Array<u256>)
import { readFileSync, writeFileSync } from "node:fs";

const dir = "circuits/build";
const proof = JSON.parse(readFileSync(`${dir}/proof.json`, "utf8"));
const publicSignals = JSON.parse(readFileSync(`${dir}/public.json`, "utf8"));

const fe = (dec) => BigInt(dec).toString(16).padStart(64, "0");
const g1 = (pt) => fe(pt[0]) + fe(pt[1]);
// G2: snarkjs [c0,c1] -> Soroban c1||c0
const g2 = (pt) => fe(pt[0][1]) + fe(pt[0][0]) + fe(pt[1][1]) + fe(pt[1][0]);

const sorobanProof = { a: g1(proof.pi_a), b: g2(proof.pi_b), c: g1(proof.pi_c) };
const sorobanPublic = publicSignals.map((s) => BigInt(s).toString());

writeFileSync(`${dir}/soroban_proof.json`, JSON.stringify(sorobanProof));
writeFileSync(`${dir}/soroban_public.json`, JSON.stringify(sorobanPublic));
console.log("wrote", `${dir}/soroban_proof.json`, "and", `${dir}/soroban_public.json`);
console.log(JSON.stringify(sorobanPublic));
