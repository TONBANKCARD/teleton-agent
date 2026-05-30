/**
 * DEX routing benchmark (STON.fi / DeDust).
 *
 * Two tiers:
 *  1. **Always-on, deterministic** — the CPU-bound routing prep every swap pays:
 *     address parsing/normalisation (`@ton/core`) and human↔base-unit amount
 *     conversion ({@link ../src/agent/tools/dedust/asset-cache.ts}). Safe for CI.
 *  2. **Network, opt-in** — a real DeDust quote round-trip, labelled and skipped
 *     unless `RUN_NETWORK_BENCH=1` (needs a TON RPC endpoint and live pools).
 *     Network latency is reported but never gates CI regression checks.
 */
import { Address } from "@ton/core";
import { toUnits, fromUnits } from "../src/agent/tools/dedust/asset-cache.js";
import type { BenchGroup, BenchModule } from "./lib/harness.js";
import { makeBench } from "./lib/harness.js";

// Mainnet jetton master addresses in both friendly (EQ…) and raw (0:…) form —
// parse fixtures only, no network access.
const SAMPLE_ADDRESSES = [
  "EQCcLAW537KnRg_aSPrnQJoyYjOZkzqYp6FVmRUvN1crSazV", // USDT jetton master (friendly)
  "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe", // raw form
];

const moduleFactory: BenchModule = async (): Promise<BenchGroup[]> => {
  const groups: BenchGroup[] = [];

  // Pre-validate which sample addresses actually parse, so the bench body never throws.
  const parsable = SAMPLE_ADDRESSES.filter((a) => {
    try {
      Address.parse(a);
      return true;
    } catch {
      return false;
    }
  });
  // Guarantee at least one valid address to parse.
  if (parsable.length === 0) {
    parsable.push("EQCcLAW537KnRg_aSPrnQJoyYjOZkzqYp6FVmRUvN1crSazV");
  }

  const parseBench = makeBench();
  parseBench.add("parse + normalise jetton addresses", () => {
    for (const a of parsable) {
      Address.parse(a).toString();
    }
  });
  groups.push({ suite: "dex-routing", group: "address-prep", bench: parseBench });

  const amountBench = makeBench();
  amountBench.add("amount <-> base units (9 decimals)", () => {
    const units = toUnits(123.456789, 9);
    fromUnits(units, 9);
    const units2 = toUnits(0.001, 9);
    fromUnits(units2, 9);
  });
  groups.push({ suite: "dex-routing", group: "amount-conversion", bench: amountBench });

  // --- Opt-in real network quote ---------------------------------------------
  if (process.env.RUN_NETWORK_BENCH === "1") {
    const { dedustQuoteExecutor } = await import("../src/agent/tools/dedust/quote.js");
    const networkBench = makeBench({ time: 4_000, iterations: 3, warmupTime: 0 });
    networkBench.add("dedust quote TON->USDT (network)", async () => {
      await dedustQuoteExecutor(
        {
          from_asset: "ton",
          to_asset: "EQCcLAW537KnRg_aSPrnQJoyYjOZkzqYp6FVmRUvN1crSazV",
          amount: 1,
        },
        // The executor only needs network access; context is unused for quotes.
        {} as never
      );
    });
    groups.push({ suite: "dex-routing", group: "network (labelled)", bench: networkBench });
  }

  return groups;
};

export default moduleFactory;
