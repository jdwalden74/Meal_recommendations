#!/usr/bin/env python3
"""
Latency benchmark for POST http://localhost:8000/recommend (FastAPI ML service).

Usage:
    python3 scripts/bench_recommendations.py

What it does:
  1. Sends 10 requests with varied caloric targets and dietary payloads.
  2. Measures round-trip time for each.
  3. Reports p50 / p95 / p99 latency and flags if p95 > 600 ms.
  4. Sends the same payload twice back-to-back to check for any cache effect.

NOTE ON CACHING:
  The FastAPI service has no explicit cache — every /recommend call runs a fresh
  KNN query. The in-memory TTL cache lives in lib/ml.ts (Next.js layer, 5-min
  TTL keyed by userId). A "cache hit" on the FastAPI side would only come from
  OS/CPU-level effects (warm data in L1/L2, warm Python interpreter, etc.).
"""

import json
import statistics
import time
import urllib.error
import urllib.request

BASE_URL = "http://localhost:8000"
P95_WARN_MS = 600

# ---------------------------------------------------------------------------
# 10 varied payloads covering different caloric targets and restriction combos
# ---------------------------------------------------------------------------
PAYLOADS = [
    # (label, payload_dict)
    ("1800 kcal, no restrictions",
     {"caloric_target": 1800, "dietary_restrictions": [], "allergies": [], "top_n": 15}),

    ("2200 kcal, vegetarian",
     {"caloric_target": 2200, "dietary_restrictions": ["vegetarian"], "allergies": [], "top_n": 15}),

    ("1500 kcal, vegan",
     {"caloric_target": 1500, "dietary_restrictions": ["vegan"], "allergies": [], "top_n": 15}),

    ("2500 kcal, peanut allergy",
     {"caloric_target": 2500, "dietary_restrictions": [], "allergies": ["peanut"], "top_n": 15}),

    ("1200 kcal, vegan + nut allergy",
     {"caloric_target": 1200, "dietary_restrictions": ["vegan"], "allergies": ["nut"], "top_n": 15}),

    ("3000 kcal, no restrictions, top_n=50",
     {"caloric_target": 3000, "dietary_restrictions": [], "allergies": [], "top_n": 50}),

    ("2000 kcal, vegetarian + dairy allergy",
     {"caloric_target": 2000, "dietary_restrictions": ["vegetarian"], "allergies": ["dairy"], "top_n": 15}),

    ("1600 kcal, no restrictions, with rated meals",
     {
         "caloric_target": 1600,
         "dietary_restrictions": [],
         "allergies": [],
         "top_n": 15,
         "rated_meals": [
             {"name": "Grilled salmon", "rating": 5.0,
              "nutrition": {"calories": 412, "protein": 46, "carbs": 0, "fat": 22}},
             {"name": "Quinoa bowl",    "rating": 4.0,
              "nutrition": {"calories": 380, "protein": 14, "carbs": 60, "fat": 8}},
         ],
     }),

    ("2800 kcal, vegan, top_n=30",
     {"caloric_target": 2800, "dietary_restrictions": ["vegan"], "allergies": [], "top_n": 30}),

    ("900 kcal, vegan + gluten + soy allergies",
     {"caloric_target": 900, "dietary_restrictions": ["vegan"],
      "allergies": ["gluten", "soy"], "top_n": 10}),
]

# The cache-hit probe uses this payload sent back-to-back
CACHE_PROBE_PAYLOAD = {"caloric_target": 2000, "dietary_restrictions": [], "allergies": [], "top_n": 15}


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------
def post_recommend(payload: dict) -> tuple[float, int]:
    """POST payload to /recommend. Returns (elapsed_ms, http_status)."""
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/recommend",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            _ = resp.read()          # consume body fully
            elapsed = (time.perf_counter() - t0) * 1000
            return elapsed, resp.status
    except urllib.error.HTTPError as e:
        elapsed = (time.perf_counter() - t0) * 1000
        return elapsed, e.code
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        print(f"  ERROR: {e}")
        return elapsed, 0


# ---------------------------------------------------------------------------
# Percentile helper (linear interpolation — same as numpy default)
# ---------------------------------------------------------------------------
def percentile(data: list[float], p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    n = len(sorted_data)
    idx = (p / 100) * (n - 1)
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return sorted_data[lo] + frac * (sorted_data[hi] - sorted_data[lo])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"\nBenchmarking POST {BASE_URL}/recommend")
    print(f"Sending {len(PAYLOADS)} requests with varied payloads…\n")
    print(
        "  NOTE: FastAPI /recommend has NO explicit cache — each call is a fresh\n"
        "  KNN query. The 5-min TTL cache lives in lib/ml.ts (Next.js layer).\n"
        "  The cache-hit probe tests OS/CPU warm-up effects only.\n"
    )

    timings: list[float] = []
    rows: list[dict] = []

    for label, payload in PAYLOADS:
        short = label[:46]
        print(f"  {short:<46} … ", end="", flush=True)
        ms, status = post_recommend(payload)
        timings.append(ms)
        flag = "⚠ ERROR" if status not in (200, 201) else ""
        rows.append({"label": label, "ms": ms, "status": status, "flag": flag})
        print(f"{ms:7.1f} ms  [HTTP {status}] {flag}")

    # ── Percentiles ──────────────────────────────────────────────────────────
    p50 = percentile(timings, 50)
    p95 = percentile(timings, 95)
    p99 = percentile(timings, 99)
    p95_flag = p95 > P95_WARN_MS

    # ── Cache-hit probe ──────────────────────────────────────────────────────
    print(f"\n  Cache-hit probe (same payload × 2 back-to-back):")
    ms1, _ = post_recommend(CACHE_PROBE_PAYLOAD)
    ms2, _ = post_recommend(CACHE_PROBE_PAYLOAD)
    diff = ms1 - ms2
    faster = ms2 < ms1 * 0.85   # >15% improvement = meaningful speedup
    cache_verdict = (
        f"2nd call {abs(diff):.1f} ms {'faster' if diff > 0 else 'slower'} "
        f"({'cache/warm effect detected' if faster else 'no meaningful speedup — no cache confirmed'})"
    )
    print(f"    Call 1: {ms1:.1f} ms")
    print(f"    Call 2: {ms2:.1f} ms  →  {cache_verdict}")

    # ── Summary table ────────────────────────────────────────────────────────
    W = 74
    border = "─" * W

    print(f"\n┌{border}┐")
    print(f"│{'BENCHMARK RESULTS':^{W}}│")
    print(f"├{border}┤")
    print(f"│  {'#':<3} {'Payload':<46} {'ms':>8}  {'Status':<8}│")
    print(f"├{border}┤")

    for i, row in enumerate(rows, 1):
        flag_str = f" {row['flag']}" if row["flag"] else ""
        print(
            f"│  {i:<3} {row['label'][:46]:<46} {row['ms']:>7.1f}ms"
            f"  {row['status']:<6}{flag_str:<3}│"
        )

    print(f"├{border}┤")

    p95_marker = "  ⚠ EXCEEDS 600ms THRESHOLD" if p95_flag else "  ✓ within 600ms threshold"
    print(f"│  p50 = {p50:6.1f} ms{' ' * (W - 18)}│")
    print(f"│  p95 = {p95:6.1f} ms{p95_marker:<{W - 18}}│")
    print(f"│  p99 = {p99:6.1f} ms{' ' * (W - 18)}│")
    print(f"├{border}┤")
    print(f"│  Cache-hit probe: {cache_verdict:<{W - 20}}│")
    print(f"│    Call 1 = {ms1:6.1f} ms   Call 2 = {ms2:6.1f} ms{' ' * (W - 41)}│")
    print(f"└{border}┘\n")

    if p95_flag:
        print(f"⚠  p95 ({p95:.1f} ms) exceeds the {P95_WARN_MS} ms threshold.")
    else:
        print(f"✓  p95 ({p95:.1f} ms) is within the {P95_WARN_MS} ms threshold.")

    if faster:
        print(
            f"⚠  Cache-hit probe: 2nd call was >15% faster ({ms1:.1f} ms → {ms2:.1f} ms).\n"
            f"   This suggests OS/CPU warm-up effects, not an explicit cache."
        )
    else:
        print(
            f"✓  Cache-hit probe: no meaningful speedup on 2nd call\n"
            f"   ({ms1:.1f} ms → {ms2:.1f} ms). Confirms no caching in FastAPI layer."
        )

    print()


if __name__ == "__main__":
    main()
