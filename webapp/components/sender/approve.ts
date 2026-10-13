"use client";
// The owner's half of a recurring plan: the connected wallet signs a USDC SAC
// approve(from=owner, spender=relayer, amount, expiration_ledger) so the daily cron can pull each
// run's amount from THIS wallet (transfer_from) instead of spending the relayer's USDC. Signed by
// the same signer the deposit uses (lib/stellar walletSigner: the kit wallet when connected, else
// the built-in testnet key), submitted through the shared sendTx wrapper.
import * as Sdk from "@stellar/stellar-sdk";
import { PASSPHRASE, RPC, DEMO_SECRET } from "@/lib/constants";
import { walletSigner, DEMO_ADDRESS } from "@/lib/stellar";
import { USDC_SAC } from "@/lib/passkey";
import { makeServer, simulate } from "@/lib/soroban/rpc";
import { sendTx } from "@/lib/soroban/send";
import { usdcToStroops } from "@/lib/zk";

// Runs one allowance covers. Approve sets (not adds to) the allowance, so whatever is still approved
// for the owner's other plans is carried over on top. Expiry: the covered span plus a 2-day margin,
// at ~5 s ledgers (17,280 a day); 4 monthly runs is ~125 days, inside testnet's max entry TTL.
export const RUNS_COVERED = 4;
const LEDGERS_PER_DAY = 17_280;

const addr = (a: string) => Sdk.nativeToScVal(a, { type: "address" });

export type SignedApproval = { hash: string; expirationLedger: number; amountUsdc: string };

export async function approveRelayer(owner: string, relayer: string, amountUsdc: string, frequency: "weekly" | "monthly"): Promise<SignedApproval> {
  const w = walletSigner();
  let publicKey: string;
  let signTransaction: (xdr: string, opts?: any) => Promise<any>;
  if (w && w.address === owner && !w.submit) {
    publicKey = w.address;
    signTransaction = w.signTransaction;
  } else if (!w && owner === DEMO_ADDRESS) {
    const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
    publicKey = kp.publicKey();
    signTransaction = Sdk.contract.basicNodeSigner(kp, PASSPHRASE).signTransaction;
  } else {
    throw new Error("this wallet cannot sign a USDC approval here");
  }

  const server = makeServer();
  const prior = await simulate(USDC_SAC, "allowance", addr(owner), addr(relayer));
  const carried = prior.ok ? BigInt(prior.value) : 0n;
  const total = carried + usdcToStroops(amountUsdc) * BigInt(RUNS_COVERED);
  const days = (frequency === "weekly" ? 7 : 31) * RUNS_COVERED + 2;
  const expirationLedger = (await server.getLatestLedger()).sequence + days * LEDGERS_PER_DAY;

  const res = await sendTx(() =>
    Sdk.contract.AssembledTransaction.build({
      contractId: USDC_SAC,
      networkPassphrase: PASSPHRASE,
      rpcUrl: RPC,
      server,
      publicKey,
      signTransaction,
      method: "approve",
      args: [addr(owner), addr(relayer), Sdk.nativeToScVal(total, { type: "i128" }), Sdk.nativeToScVal(expirationLedger, { type: "u32" })],
      parseResultXdr: (r) => r,
    }),
  );
  const hash = res?.sendTransactionResponse?.hash || res?.getTransactionResponse?.txHash || "";
  if (!hash) throw new Error("approval submitted but no transaction hash came back");
  return { hash, expirationLedger, amountUsdc: (Number(total) / 1e7).toString() };
}
