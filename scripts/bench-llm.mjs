#!/usr/bin/env node
/**
 * Latency benchmark for POST /api/llm
 *
 * Usage:
 *   SESSION_COOKIE="<next-auth.session-token=...>" node scripts/bench-llm.mjs
 *
 * How to get your session cookie:
 *   1. Sign in to the app at http://localhost:3000
 *   2. Open DevTools → Application → Cookies → http://localhost:3000
 *   3. Copy the value of `next-auth.session-token`
 *   4. Set SESSION_COOKIE="next-auth.session-token=<value>"
 *
 * NOTE ON TTFT vs TOTAL TIME:
 *   The /api/llm route buffers the entire LLM response server-side before
 *   sending (see route.ts lines 433-481). This means TTFT ≈ Total — both
 *   reflect the time for the LLM to finish generating the full reply.
 *   The gap between them is just the time to read the response body over
 *   the loopback network (~ms).
 */

const BASE_URL = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "";
const TTFT_WARN_MS = 800;
const TOTAL_WARN_MS = 5000;

const PROMPTS = [
  "Suggest a healthy breakfast for tomorrow.",
  "Plan dinner for the next three days.",
  "What's a good high-protein lunch I could make quickly?",
  "Give me a light meal for tonight — something under 500 calories.",
  "Plan my full week of meals starting tomorrow.",
];

if (!SESSION_COOKIE) {
  console.error(
    "ERROR: SESSION_COOKIE env var is required.\n" +
    "See the usage instructions at the top of this file."
  );
  process.exit(1);
}

async function measureRequest(prompt, index) {
  const start = performance.now();
  let ttft = null;

  const res = await fetch(`${BASE_URL}/api/llm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: SESSION_COOKIE,
    },
    body: JSON.stringify({ message: prompt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let totalChars = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (ttft === null) {
      ttft = performance.now() - start;
    }
    totalChars += decoder.decode(value, { stream: true }).length;
  }

  const total = performance.now() - start;

  // ttft may be null if body was empty; fall back to total
  if (ttft === null) ttft = total;

  return { ttft, total, totalChars };
}

function pad(str, width) {
  return String(str).padStart(width);
}

function fmt(ms) {
  return `${ms.toFixed(0)}ms`;
}

async function main() {
  console.log(`\nBenchmarking POST ${BASE_URL}/api/llm`);
  console.log(`Sending ${PROMPTS.length} prompts sequentially…\n`);
  console.log(
    "  NOTE: /api/llm buffers the full LLM reply before sending, so\n" +
    "  TTFT ≈ Total. The gap is only body-read latency over loopback.\n"
  );

  const results = [];
  const flags = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    process.stdout.write(`  [${i + 1}/${PROMPTS.length}] "${prompt.slice(0, 55)}"… `);

    try {
      const { ttft, total, totalChars } = await measureRequest(prompt, i);
      const rowFlags = [];
      if (ttft > TTFT_WARN_MS) rowFlags.push(`TTFT>${TTFT_WARN_MS}ms`);
      if (total > TOTAL_WARN_MS) rowFlags.push(`Total>${TOTAL_WARN_MS / 1000}s`);
      results.push({ prompt, ttft, total, totalChars, flags: rowFlags });
      console.log(`done (${fmt(total)}, ${totalChars} chars)`);
    } catch (err) {
      results.push({ prompt, ttft: null, total: null, totalChars: 0, flags: ["ERROR"], error: err.message });
      console.log(`ERROR: ${err.message}`);
    }
  }

  // ── Summary table ────────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.total !== null);
  const ttfts = ok.map((r) => r.ttft);
  const totals = ok.map((r) => r.total);

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│                        LATENCY RESULTS                              │");
  console.log("├──────────────────────────────────────────────────────────────────────┤");
  console.log(
    `│ ${"#".padEnd(2)} ${"Prompt (truncated)".padEnd(38)} ${"TTFT".padStart(8)} ${"Total".padStart(8)} ${"Flags".padStart(10)} │`
  );
  console.log("├──────────────────────────────────────────────────────────────────────┤");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const num = String(i + 1).padEnd(2);
    const promptStr = r.prompt.slice(0, 38).padEnd(38);
    const ttftStr = r.ttft !== null ? fmt(r.ttft).padStart(8) : "    ERR ";
    const totalStr = r.total !== null ? fmt(r.total).padStart(8) : "    ERR ";
    const flagStr = r.flags.length ? (" ⚠ " + r.flags.join(" ")).padStart(10) : "".padStart(10);
    console.log(`│ ${num} ${promptStr} ${ttftStr} ${totalStr} ${flagStr} │`);
  }

  console.log("├──────────────────────────────────────────────────────────────────────┤");

  if (ok.length > 0) {
    const minTtft  = Math.min(...ttfts);
    const maxTtft  = Math.max(...ttfts);
    const avgTtft  = ttfts.reduce((a, b) => a + b, 0) / ttfts.length;
    const minTotal = Math.min(...totals);
    const maxTotal = Math.max(...totals);
    const avgTotal = totals.reduce((a, b) => a + b, 0) / totals.length;

    const stat = (label, minMs, avgMs, maxMs) =>
      console.log(
        `│ ${label.padEnd(10)} min=${fmt(minMs).padStart(7)}  avg=${fmt(avgMs).padStart(7)}  max=${fmt(maxMs).padStart(7)}                   │`
      );

    stat("TTFT", minTtft, avgTtft, maxTtft);
    stat("Total", minTotal, avgTotal, maxTotal);
  } else {
    console.log("│  No successful requests.                                             │");
  }

  console.log("└──────────────────────────────────────────────────────────────────────┘");

  // ── Flagged requests ─────────────────────────────────────────────────────────
  const flagged = results.filter((r) => r.flags.length > 0);
  if (flagged.length > 0) {
    console.log("\n⚠  FLAGGED REQUESTS:");
    for (const r of flagged) {
      console.log(`   [${r.flags.join(", ")}] "${r.prompt}"`);
      if (r.error) console.log(`   Error: ${r.error}`);
    }
  } else {
    console.log("\n✓  All requests within thresholds (TTFT ≤ 800ms, Total ≤ 5s).");
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
