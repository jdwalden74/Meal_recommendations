#!/usr/bin/env python3
"""
Robustness test suite for:
  POST http://localhost:3000/api/llm      (Next.js, session auth required)
  POST http://localhost:8000/recommend    (FastAPI, no auth)

Suites
──────
  1. Concurrency       — 5 simultaneous requests to each endpoint
  2. Empty body        — missing / empty / whitespace-only required fields
  3. Special chars     — message/restriction fields filled with !@#$%^&*()
  4. Invalid date      — "February 31st" and ISO-invalid date in LLM prompt;
                         boundary/impossible values for FastAPI
  5. Malformed JSON    — truncated / non-JSON body sent as application/json

Pass criteria (per case)
────────────────────────
  Concurrency   : all 5 workers return HTTP 200 with no connection error
  Empty body    : 4xx returned, never 500
  Special chars : server responds (any status), never 500 or connection error
  Invalid date  : HTTP 200 + body not empty (graceful) for LLM;
                  HTTP 422 (validation) for FastAPI
  Malformed JSON: 4xx returned, never 500 ← NOTE: /api/llm currently returns
                  500 here (request.json() throws inside the catch block);
                  the test flags this as a FAIL and reports it as a bug.
"""

import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

# ── Config ─────────────────────────────────────────────────────────────────────
LLM_URL = "http://localhost:3000/api/llm"
REC_URL = "http://localhost:8000/recommend"

SESSION_COOKIE = (
    "next-auth.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0"
    ".._4FCk9CNWDQQbqW2.Ez08c8wxdjld0Q9yxCzhb5T1ykrN20yi1KFRNkj0ZaKJTkNwNx"
    "_SjDN9TFTS1JGufiNQvNN4pKxJkIiwyMiQoFyTa0KZJwfI2JUQ1bvXRhIoJAhoz7WKWBr"
    "1zGR3cI037VSboukMD80wQ3nrmUwRr97x4az8sqmsfMxf2m7TMGiX_i3FC1Z5P3CMf0viv"
    "61yqm98b3exYctGwO9G7J0L4cv_hPkQ2vgKcD-apNtxF2w4vUsyI1yQMbHICQNC-S7WkkA"
    "23Pn6DFJ35DrSivO29Kao7XrIBS6D5aaheZgHTRPxRdB93Wk6ySVjCchCmCT3xz6wU3EaM"
    "t8g0ODL3bpiJGfZd4NC7a3Bud4FDsy7Bjg.8luDvzZuyUlvux0gX6-J7A"
)

TODAY = date(2026, 4, 20)
def day(n: int) -> str:
    return (TODAY + timedelta(days=n)).isoformat()

TICK  = "✓"
CROSS = "✗"
WARN  = "⚠"


# ── Low-level HTTP helpers ──────────────────────────────────────────────────────
def _request(url: str, raw_body: bytes, headers: dict, timeout: int = 30) -> tuple[int, str]:
    """Send a raw POST request. Returns (status, body). Never raises."""
    req = urllib.request.Request(url, data=raw_body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        return 0, f"URLError: {e.reason}"
    except Exception as e:
        return 0, f"Exception: {e}"


def llm_post(message: str) -> tuple[int, str]:
    body = json.dumps({"message": message}).encode()
    return _request(LLM_URL, body,
                    {"Content-Type": "application/json", "Cookie": SESSION_COOKIE})


def llm_raw(raw: bytes, content_type: str = "application/json") -> tuple[int, str]:
    return _request(LLM_URL, raw,
                    {"Content-Type": content_type, "Cookie": SESSION_COOKIE})


def rec_post(payload: dict) -> tuple[int, str]:
    body = json.dumps(payload).encode()
    return _request(REC_URL, body, {"Content-Type": "application/json"})


def rec_raw(raw: bytes) -> tuple[int, str]:
    return _request(REC_URL, raw, {"Content-Type": "application/json"})


# ── Result helpers ─────────────────────────────────────────────────────────────
class R:
    """Lightweight result record."""
    def __init__(self, name: str, passed: bool, status: int, detail: str,
                 bug: str | None = None):
        self.name   = name
        self.passed = passed
        self.status = status
        self.detail = detail
        self.bug    = bug   # non-None → flagged as a known/new bug


all_results: list[R] = []

def record(name: str, passed: bool, status: int, detail: str,
           bug: str | None = None) -> R:
    r = R(name, passed, status, detail, bug)
    all_results.append(r)
    icon = TICK if passed else (WARN if bug else CROSS)
    bug_note = f"  [{bug}]" if bug else ""
    print(f"    {icon} {name:<52} HTTP {status or '---'}  {detail}{bug_note}")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# Suite 1 — Concurrency
# ══════════════════════════════════════════════════════════════════════════════
def suite_concurrency():
    print("\n── Suite 1: Concurrency (5 simultaneous requests) ─────────────────────")

    # /api/llm — each worker sends a distinct carnivore-safe prompt
    llm_prompts = [
        f"Set a ribeye steak for dinner on {day(i)}." for i in range(5)
    ]
    print(f"  /api/llm  × 5 workers …")
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(llm_post, p): i for i, p in enumerate(llm_prompts)}
        statuses = {}
        for fut in as_completed(futures):
            idx = futures[fut]
            status, body = fut.result()
            statuses[idx] = (status, body)

    for idx, (status, body) in sorted(statuses.items()):
        passed  = status == 200
        crashed = status == 500
        detail  = "OK" if passed else ("server error" if crashed else f"unexpected {status}")
        record(f"  Worker {idx+1}",
               passed, status, detail,
               bug="500 under concurrency" if crashed else None)

    # /api/recommendations — lightweight KNN, no rate limit
    rec_payload = {"caloric_target": 2000, "dietary_restrictions": [], "allergies": [], "top_n": 10}
    print(f"  /api/recommendations × 5 workers …")
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = [ex.submit(rec_post, rec_payload) for _ in range(5)]
        for i, fut in enumerate(as_completed(futures)):
            status, body = fut.result()
            passed  = status == 200
            crashed = status == 500
            detail  = "OK" if passed else ("server error" if crashed else f"unexpected {status}")
            record(f"  Worker {i+1}",
                   passed, status, detail,
                   bug="500 under concurrency" if crashed else None)


# ══════════════════════════════════════════════════════════════════════════════
# Suite 2 — Empty / missing body
# ══════════════════════════════════════════════════════════════════════════════
def suite_empty_body():
    print("\n── Suite 2: Empty / missing required fields ────────────────────────────")

    cases_llm = [
        ('{"message": ""}',         b'{"message": ""}',       "400 (empty string)"),
        ('{}',                       b'{}',                    "400 (missing key)"),
        ('{"message": "   "}',       b'{"message": "   "}',   "400 (whitespace only)"),
        ('{"message": null}',        b'{"message": null}',    "400 (null value)"),
    ]
    print("  /api/llm …")
    for label, raw, expect in cases_llm:
        status, body = llm_raw(raw)
        passed = 400 <= status <= 499
        crashed = status == 500
        detail = f"got {status} — {'✓ expected 4xx' if passed else '✗ expected 4xx'}"
        record(f"  LLM {label}",
               passed, status, detail,
               bug=f"should be 4xx, got 500" if crashed else None)

    cases_rec = [
        ("{}",                          {},                           "422 (missing caloric_target)"),
        ('{"caloric_target": 0}',       {"caloric_target": 0},       "422 (gt=0 violated)"),
        ('{"caloric_target": -500}',    {"caloric_target": -500},    "422 (negative)"),
        ('{"caloric_target": 2000, "top_n": 0}',
                                        {"caloric_target": 2000, "top_n": 0},
                                        "422 (top_n ge=1 violated)"),
    ]
    print("  /api/recommendations …")
    for label, payload, expect in cases_rec:
        status, body = rec_post(payload)
        passed = status == 422
        detail = f"got {status} — {'✓' if passed else '✗'} expected 422"
        record(f"  REC {label[:45]}",
               passed, status, detail)


# ══════════════════════════════════════════════════════════════════════════════
# Suite 3 — Special characters
# ══════════════════════════════════════════════════════════════════════════════
def suite_special_chars():
    print("\n── Suite 3: Special characters in request fields ───────────────────────")

    special_msgs = [
        ("Pure symbols",          "!@#$%^&*()"),
        ("Unicode + symbols",     "🍗 €£¥ ñ ü !@#$%^&*()[]{}"),
        ("Null-byte string",      "Set dinner\x00 on \x00 today"),
        ("Very long (2 000 ch)",  "a" * 2000),
        ("SQL injection attempt", "'; DROP TABLE users; --"),
        ("Script injection",      "<script>alert('xss')</script>"),
    ]

    print("  /api/llm (special message strings) …")
    for label, msg in special_msgs:
        body = json.dumps({"message": msg}).encode()
        status, resp_body = llm_raw(body)
        # Pass = server responded (any status), did NOT crash (500) or drop connection (0)
        passed  = status != 500 and status != 0
        crashed = status == 500
        detail  = f"got {status} — {'✓ no crash' if passed else '✗ server error'}"
        record(f"  LLM {label}",
               passed, status, detail,
               bug="500 on special-char input" if crashed else None)

    special_rec = [
        ("Special restriction",   {"caloric_target": 2000, "dietary_restrictions": ["!@#$%^&*()"], "allergies": []}),
        ("Emoji in allergen",     {"caloric_target": 2000, "dietary_restrictions": [], "allergies": ["🥜"]}),
        ("SQL in restriction",    {"caloric_target": 2000, "dietary_restrictions": ["'; DROP TABLE--"], "allergies": []}),
        ("Very long restriction", {"caloric_target": 2000, "dietary_restrictions": ["a" * 500], "allergies": []}),
    ]
    print("  /api/recommendations (special string fields) …")
    for label, payload in special_rec:
        status, body = rec_post(payload)
        passed  = status != 500 and status != 0
        crashed = status == 500
        detail  = f"got {status} — {'✓ no crash' if passed else '✗ server error'}"
        record(f"  REC {label}",
               passed, status, detail,
               bug="500 on special-char input" if crashed else None)


# ══════════════════════════════════════════════════════════════════════════════
# Suite 4 — Invalid / non-existent dates and impossible values
# ══════════════════════════════════════════════════════════════════════════════
def suite_invalid_dates():
    print("\n── Suite 4: Invalid / impossible inputs ────────────────────────────────")

    date_cases = [
        ("February 31st (natural language)",
         "Change dinner on February 31st to a ribeye steak."),
        ("ISO date 2026-02-31 (invalid day)",
         f"Set a salmon lunch on 2026-02-31."),
        ("Year 9999 far future",
         "Add a steak dinner on 9999-12-31."),
        ("Year 0001 far past",
         "Change lunch on 0001-01-01 to bacon and eggs."),
    ]

    print("  /api/llm (invalid/impossible dates in message) …")
    for label, msg in date_cases:
        status, body = llm_post(msg)
        time.sleep(2)          # small gap — not a full inter-request delay, just rate courtesy
        # Pass = HTTP 200 with non-empty body (graceful handling, not a crash)
        passed  = status == 200 and len(body.strip()) > 0
        crashed = status == 500
        detail  = (
            f"got {status}, {len(body)} chars — ✓ graceful" if passed
            else f"got {status} — ✗ not graceful"
        )
        record(f"  LLM {label}",
               passed, status, detail,
               bug="500 on impossible date" if crashed else None)

    impossible_rec = [
        ("caloric_target = 0.001 (tiny, passes gt=0)",
         {"caloric_target": 0.001, "dietary_restrictions": [], "allergies": []}),
        ("caloric_target = 999_999 (extreme high)",
         {"caloric_target": 999_999, "dietary_restrictions": [], "allergies": []}),
        ("top_n = 51 (exceeds le=50)",
         {"caloric_target": 2000, "dietary_restrictions": [], "allergies": [], "top_n": 51}),
        ("rated_meal rating = 6.0 (exceeds le=5)",
         {"caloric_target": 2000, "dietary_restrictions": [], "allergies": [],
          "rated_meals": [{"name": "Steak", "rating": 6.0,
                           "nutrition": {"calories": 500, "protein": 40, "carbs": 0, "fat": 30}}]}),
    ]
    print("  /api/recommendations (boundary / impossible values) …")
    for label, payload in impossible_rec:
        status, body = rec_post(payload)
        # 0.001 and 999_999 are technically valid (pass Pydantic) — expect 200
        # top_n=51 and rating=6.0 violate Field constraints — expect 422
        if "tiny" in label or "extreme" in label:
            passed = status == 200
            detail = f"got {status} — {'✓ accepted (valid per Pydantic)' if passed else '✗ unexpected'}"
        else:
            passed = status == 422
            detail = f"got {status} — {'✓ rejected 422' if passed else '✗ expected 422'}"
        crashed = status == 500
        record(f"  REC {label[:50]}",
               passed, status, detail,
               bug="500 on impossible value" if crashed else None)


# ══════════════════════════════════════════════════════════════════════════════
# Suite 5 — Malformed JSON body
# ══════════════════════════════════════════════════════════════════════════════
def suite_malformed_json():
    print("\n── Suite 5: Malformed JSON body ────────────────────────────────────────")
    print("  NOTE: /api/llm calls request.json() inside its outer try/catch.")
    print("  A JSON parse failure there becomes a caught exception → 500.")
    print("  Expected: 4xx. Actual: 500. This is a BUG flagged below.\n")

    malformed = [
        ("Truncated JSON",        b'{"message": '),
        ("Plain text",            b'not json at all'),
        ("Empty body",            b''),
        ("Array instead of obj",  b'["message", "hello"]'),
        ("Double-encoded string", b'"{\\"message\\":\\"hello\\"}"'),
    ]

    print("  /api/llm (malformed body) …")
    for label, raw in malformed:
        status, body = llm_raw(raw)
        # Ideal: 400/422. Actual (known bug): 500.
        is_4xx   = 400 <= status <= 499
        is_500   = status == 500
        passed   = is_4xx          # pass only if server returns proper 4xx
        detail   = (
            f"got {status} — ✓ correct 4xx"                       if is_4xx  else
            f"got {status} — ✗ should be 4xx (BUG: returns 500)"  if is_500  else
            f"got {status} — ✗ unexpected"
        )
        record(f"  LLM {label}",
               passed, status, detail,
               bug="returns 500 for malformed JSON (should be 400)" if is_500 else None)

    print("  /api/recommendations (malformed body) …")
    for label, raw in malformed:
        status, body = rec_raw(raw)
        passed = 400 <= status <= 499   # FastAPI returns 422 for parse errors
        detail = f"got {status} — {'✓ correct 4xx' if passed else '✗ unexpected'}"
        record(f"  REC {label}",
               passed, status, detail)


# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════
def main():
    print("\n" + "=" * 72)
    print("  ROBUSTNESS TEST SUITE")
    print("  /api/llm (Next.js)  ·  /api/recommendations (FastAPI)")
    print("=" * 72)

    suite_concurrency()
    suite_empty_body()
    suite_special_chars()
    suite_invalid_dates()
    suite_malformed_json()

    # ── Summary ────────────────────────────────────────────────────────────────
    total  = len(all_results)
    passed = sum(1 for r in all_results if r.passed)
    bugs   = [r for r in all_results if r.bug]

    W = 72
    print(f"\n{'═' * W}")
    print(f"  SUMMARY")
    print(f"{'─' * W}")

    suite_names = {
        "concurrency": [], "empty": [], "special": [],
        "invalid": [], "malformed": [],
    }
    for r in all_results:
        n = r.name.lower()
        if "worker" in n:        suite_names["concurrency"].append(r)
        elif "llm {" in n or "rec {" in n or "whitespace" in n or "missing" in n or \
             "null" in n or "empty string" in n or "missing key" in n or \
             "top_n" in n or "caloric" in n or "negative" in n:
            suite_names["empty"].append(r)
        elif any(x in n for x in ["symbol","unicode","null-byte","long","sql","script",
                                   "special","emoji"]):
            suite_names["special"].append(r)
        elif any(x in n for x in ["february","iso date","year","tiny","extreme",
                                   "top_n = 51","rating = 6"]):
            suite_names["invalid"].append(r)
        else:
            suite_names["malformed"].append(r)

    suite_label = {
        "concurrency": "1. Concurrency",
        "empty":       "2. Empty body",
        "special":     "3. Special chars",
        "invalid":     "4. Invalid inputs",
        "malformed":   "5. Malformed JSON",
    }

    for key, label in suite_label.items():
        rs = suite_names[key]
        if not rs:
            rs = [r for r in all_results]   # fallback: all
        p = sum(1 for r in rs if r.passed)
        t = len(rs)
        bar = TICK * p + CROSS * (t - p)
        print(f"  {label:<22}  {bar}  {p}/{t}")

    rate = passed / total if total else 0.0
    print(f"{'─' * W}")
    print(f"  Overall: {passed}/{total} passed  ({rate:.1%})")

    if bugs:
        print(f"\n  {'─' * 68}")
        print(f"  BUGS FOUND ({len(bugs)}):")
        seen = set()
        for r in bugs:
            if r.bug not in seen:
                seen.add(r.bug)
                print(f"    {WARN} {r.bug}")
                print(f"      Affected: {r.name.strip()} → HTTP {r.status}")
        print(f"\n  Fix for /api/llm malformed JSON (route.ts:341):")
        print(f"    Wrap `request.json()` in its own try/catch and return 400")
        print(f"    before the auth + business logic runs:")
        print(f"      let body: unknown;")
        print(f"      try {{ body = await request.json(); }}")
        print(f"      catch {{ return Response.json({{error:'Invalid JSON.'}},{{status:400}}); }}")
    else:
        print(f"\n  No bugs found.")

    print(f"{'═' * W}\n")


if __name__ == "__main__":
    main()
