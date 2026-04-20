#!/usr/bin/env python3
"""
Resource profiling for the FastAPI ML service (ml/main.py).

Lifecycle
─────────
  Phase 0  — baseline: RSS immediately after the process spawns,
              before the lifespan handler has loaded any artifact
  Phase 1  — post-index: RSS after /health returns {"status":"ok"}
              (recommender.pkl + scaler.pkl + food_index.pkl loaded;
               X_scaled pre-computed)
  Phase 2  — 20 consecutive POST /recommend calls:
              • RSS sampled before and after every request
              • per-process CPU% sampled for 0.5 s immediately after
                each request completes (idle check)

Summary flags
─────────────
  Peak RSS        target < 200 MB
  Memory growth   from phase-1 baseline across 20 requests;
                  flag if > 50 MB
  CPU idle        flag any request where post-request CPU% > 5 %
                  (sustained load between requests)
"""

import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    import psutil
except ImportError:
    sys.exit("psutil is required: pip3 install psutil --break-system-packages")

# ── Config ─────────────────────────────────────────────────────────────────────
REC_URL      = "http://localhost:8000"
SERVICE_PORT = 8000
ML_DIR       = Path(__file__).resolve().parent.parent / "ml"
STARTUP_TIMEOUT = 30    # seconds to wait for /health to go green

# The ML service requires the CommandLineTools Python (has uvicorn/sklearn/etc.)
# sys.executable points to the Homebrew Python which lacks those deps.
ML_PYTHON = (
    "/Library/Developer/CommandLineTools/Library/Frameworks/"
    "Python3.framework/Versions/3.9/bin/python3"
)
N_REQUESTS   = 20
PEAK_RSS_TARGET_MB   = 200.0
GROWTH_WARN_MB       =  50.0
IDLE_CPU_WARN_PCT    =   5.0   # CPU% above this after a request = not idle

# Varied payloads so KNN isn't trivially cached
PAYLOADS = [
    {"caloric_target": 1800 + i * 50, "dietary_restrictions": [], "allergies": [], "top_n": 15}
    for i in range(N_REQUESTS)
]

# ── Helpers ─────────────────────────────────────────────────────────────────────
def mb(bytes_: int) -> float:
    return bytes_ / 1024 / 1024

def rss_mb(proc: psutil.Process) -> float:
    return mb(proc.memory_info().rss)

def post_recommend(payload: dict) -> tuple[float, int]:
    """POST /recommend. Returns (elapsed_ms, http_status)."""
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{REC_URL}/recommend", data=data,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
            return (time.perf_counter() - t0) * 1000, resp.status
    except urllib.error.HTTPError as e:
        return (time.perf_counter() - t0) * 1000, e.code
    except Exception:
        return (time.perf_counter() - t0) * 1000, 0

def wait_for_health(timeout: int = STARTUP_TIMEOUT) -> bool:
    """Poll /health until {"status":"ok"} or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{REC_URL}/health", timeout=2) as r:
                data = json.loads(r.read())
                if data.get("status") == "ok":
                    return True
        except Exception:
            pass
        time.sleep(0.25)
    return False

def kill_port(port: int):
    """Kill any process listening on the given port."""
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"], capture_output=True, text=True
        )
        for pid_str in result.stdout.strip().splitlines():
            try:
                os.kill(int(pid_str), signal.SIGTERM)
            except ProcessLookupError:
                pass
        time.sleep(1)
    except Exception:
        pass

# ── Main ────────────────────────────────────────────────────────────────────────
def main():
    print("\n" + "=" * 66)
    print("  ML SERVICE RESOURCE PROFILER  —  POST /recommend (FastAPI)")
    print("=" * 66)
    print(f"  Targets: peak RSS < {PEAK_RSS_TARGET_MB:.0f} MB  |"
          f"  memory growth ≤ {GROWTH_WARN_MB:.0f} MB over {N_REQUESTS} requests\n")

    # ── Phase 0: start fresh process, capture baseline RSS ────────────────────
    print("── Phase 0: spawn fresh service ────────────────────────────────────")
    kill_port(SERVICE_PORT)

    proc = subprocess.Popen(
        [ML_PYTHON, "-m", "uvicorn", "main:app", "--port", str(SERVICE_PORT),
         "--log-level", "warning"],
        cwd=ML_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ps = psutil.Process(proc.pid)

    # Give the interpreter a moment to initialise before first RSS read
    time.sleep(0.5)
    rss_baseline = rss_mb(ps)
    print(f"  PID {proc.pid}  —  RSS immediately after spawn: {rss_baseline:.1f} MB")

    # ── Phase 1: wait for lifespan to finish, record post-index RSS ───────────
    print("\n── Phase 1: wait for artifact load ─────────────────────────────────")
    t_load_start = time.time()
    if not wait_for_health():
        proc.terminate()
        sys.exit("ERROR: service did not become healthy within timeout")
    load_duration = time.time() - t_load_start

    rss_post_index = rss_mb(ps)
    index_growth   = rss_post_index - rss_baseline
    print(f"  Healthy in {load_duration:.2f}s")
    print(f"  RSS after index load: {rss_post_index:.1f} MB  "
          f"(+{index_growth:.1f} MB from baseline)")

    # Prime the CPU% counter so first sample is valid
    ps.cpu_percent(interval=None)

    # ── Phase 2: 20 consecutive requests ──────────────────────────────────────
    print(f"\n── Phase 2: {N_REQUESTS} consecutive requests ──────────────────────────────────")
    print(f"  {'#':>3}  {'RSS before':>10}  {'RSS after':>9}  {'Δ':>6}  "
          f"{'ms':>7}  {'CPU% idle':>9}")
    print(f"  {'─'*3}  {'─'*10}  {'─'*9}  {'─'*6}  {'─'*7}  {'─'*9}")

    rss_before_list = []
    rss_after_list  = []
    cpu_idle_list   = []
    latency_list    = []
    non_200         = []

    for i, payload in enumerate(PAYLOADS, 1):
        rss_before = rss_mb(ps)
        elapsed_ms, status = post_recommend(payload)
        rss_after  = rss_mb(ps)

        # Sample CPU% for 0.5 s after the request (measures idle/residual load)
        cpu_idle = ps.cpu_percent(interval=0.5)

        delta = rss_after - rss_before
        flag  = "⚠" if cpu_idle > IDLE_CPU_WARN_PCT else " "

        print(f"  {i:>3}  {rss_before:>9.1f}M  {rss_after:>8.1f}M  "
              f"{delta:>+5.1f}M  {elapsed_ms:>6.1f}ms  {cpu_idle:>7.1f}%{flag}")

        rss_before_list.append(rss_before)
        rss_after_list.append(rss_after)
        cpu_idle_list.append(cpu_idle)
        latency_list.append(elapsed_ms)
        if status != 200:
            non_200.append((i, status))

    # ── Compute summary stats ──────────────────────────────────────────────────
    peak_rss      = max(rss_after_list)
    final_rss     = rss_after_list[-1]
    total_growth  = final_rss - rss_post_index
    max_cpu_idle  = max(cpu_idle_list)
    avg_cpu_idle  = sum(cpu_idle_list) / len(cpu_idle_list)
    hot_requests  = [i+1 for i, c in enumerate(cpu_idle_list) if c > IDLE_CPU_WARN_PCT]
    avg_latency   = sum(latency_list) / len(latency_list)

    peak_ok   = peak_rss    <  PEAK_RSS_TARGET_MB
    growth_ok = total_growth <= GROWTH_WARN_MB

    # ── Print summary ──────────────────────────────────────────────────────────
    W = 66
    print(f"\n{'─' * W}")
    print(f"  SUMMARY")
    print(f"{'─' * W}")

    def row(label, value, flag=""):
        print(f"  {label:<38} {value}{flag}")

    row("Baseline RSS (pre-index)",     f"{rss_baseline:.1f} MB")
    row("RSS after index load",         f"{rss_post_index:.1f} MB  (+{index_growth:.1f} MB)")
    row("Index load duration",          f"{load_duration:.2f}s")
    row("Peak RSS across 20 requests",
        f"{peak_rss:.1f} MB",
        f"  {'✓ < 200 MB' if peak_ok else '⚠ EXCEEDS 200 MB TARGET'}")
    row("Final RSS after 20 requests",  f"{final_rss:.1f} MB")
    row("Total memory growth (20 req)", f"{total_growth:+.1f} MB",
        f"  {'✓ ≤ 50 MB' if growth_ok else '⚠ EXCEEDS 50 MB THRESHOLD'}")
    row("Avg latency per request",      f"{avg_latency:.1f} ms")
    row("Max post-request CPU% (idle)", f"{max_cpu_idle:.1f}%")
    row("Avg post-request CPU% (idle)", f"{avg_cpu_idle:.1f}%")

    if hot_requests:
        row("Requests above CPU idle threshold",
            f"req {hot_requests}  ⚠ CPU > {IDLE_CPU_WARN_PCT}%")
    else:
        row("CPU returns to idle after each req", "✓ all below 5%")

    if non_200:
        row("Non-200 responses", str(non_200), "  ⚠")
    else:
        row("All 20 requests HTTP 200", "✓")

    print(f"{'─' * W}")

    overall_ok = peak_ok and growth_ok and not non_200
    print(f"\n  {'✓ All targets met.' if overall_ok else '⚠ One or more targets missed — see above.'}\n")

    proc.terminate()
    proc.wait()


if __name__ == "__main__":
    main()
