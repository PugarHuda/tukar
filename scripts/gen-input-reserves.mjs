// Emit a reserves circuit input.json for a chosen leaf set. Default: leaves [500,300] declared 800.
import { buildPoseidon } from "circomlibjs";
const N = 32;
const amtsArg = (process.env.RESERVES_AMTS || "500,300").split(",").filter(Boolean).map(BigInt);
const declared = BigInt(process.env.RESERVES_DECLARED || amtsArg.reduce((a,b)=>a+b,0n).toString());
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a,b,c)=>F.toObject(poseidon([a,b,c]));
const PAD = H3(0n,0n,0n);
const pk=(i)=>100n+BigInt(i), bl=(i)=>9000n+BigInt(i);
const commitments=[],amounts=[],pubKeys=[],blindings=[];
for(let i=0;i<N;i++){
  if(i<amtsArg.length){amounts.push(amtsArg[i]);pubKeys.push(pk(i));blindings.push(bl(i));commitments.push(H3(amtsArg[i],pk(i),bl(i)));}
  else{amounts.push(0n);pubKeys.push(0n);blindings.push(0n);commitments.push(PAD);}
}
console.log(JSON.stringify({commitments:commitments.map(String),declaredLiabilities:declared.toString(),amounts:amounts.map(String),pubKeys:pubKeys.map(String),blindings:blindings.map(String)}));
