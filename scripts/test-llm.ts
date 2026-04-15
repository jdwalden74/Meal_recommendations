/**
 * Smoke-test for lib/llm.ts
 * Usage: npx tsx --env-file=.env.local scripts/test-llm.ts
 */

import { chat } from "../lib/llm";

async function main() {
  const reply = await chat([
    { role: "user", content: "Reply with exactly: connection successful" },
  ]);
  console.log("Response:", reply);
}

main();
