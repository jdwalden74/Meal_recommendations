#!/usr/bin/env python3
"""
Structural accuracy test for POST /api/llm — <meal_action> block validation.

For each of 20 meal-modification prompts:
  1. Block present       — response contains at least one <meal_action> block
  2. JSON valid          — the block content parses without error
  3. date present        — top-level "date" key is an ISO YYYY-MM-DD string
  4. meal_type present   — meal.type is one of breakfast/lunch/dinner/snack
  5. food present        — meal.name is a non-empty string

All 5 checks must pass for a prompt to be marked PASS.

Additionally sends 3 prompts that deliberately omit the date and confirms the
server responds gracefully (HTTP 200, no error body) without crashing.

Target: structural accuracy ≥ 94% (≥ 19/20 prompts PASS).
"""

import json
import re
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

# ── Session ───────────────────────────────────────────────────────────────────
SESSION_COOKIE = (
    "next-auth.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0"
    ".._4FCk9CNWDQQbqW2.Ez08c8wxdjld0Q9yxCzhb5T1ykrN20yi1KFRNkj0ZaKJTkNwNx"
    "_SjDN9TFTS1JGufiNQvNN4pKxJkIiwyMiQoFyTa0KZJwfI2JUQ1bvXRhIoJAhoz7WKWBr"
    "1zGR3cI037VSboukMD80wQ3nrmUwRr97x4az8sqmsfMxf2m7TMGiX_i3FC1Z5P3CMf0viv"
    "61yqm98b3exYctGwO9G7J0L4cv_hPkQ2vgKcD-apNtxF2w4vUsyI1yQMbHICQNC-S7WkkA"
    "23Pn6DFJ35DrSivO29Kao7XrIBS6D5aaheZgHTRPxRdB93Wk6ySVjCchCmCT3xz6wU3EaM"
    "t8g0ODL3bpiJGfZd4NC7a3Bud4FDsy7Bjg.8luDvzZuyUlvux0gX6-J7A"
)

BASE_URL = "http://localhost:3000"
ACCURACY_TARGET = 0.94          # ≥ 94 %
VALID_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MEAL_ACTION_RE = re.compile(r"<meal_action>([\s\S]*?)</meal_action>", re.IGNORECASE)

# Gemini free tier: 15 RPM. Stay safely under with a 5s gap + retry backoff.
INTER_REQUEST_DELAY = 5.0       # seconds between prompts
RATE_LIMIT_RESPONSE = "Sorry, I couldn't generate a response. Please try again."
MAX_RETRIES = 3

# ── Date helpers ──────────────────────────────────────────────────────────────
# Today = Monday 2026-04-20 (per session context)
TODAY = date(2026, 4, 20)

def day(offset: int) -> str:
    """Return ISO date string for TODAY + offset days."""
    return (TODAY + timedelta(days=offset)).isoformat()

# ── 20 meal-modification prompts ─────────────────────────────────────────────
# All foods are carnivore-compatible (animal products only) to respect the
# user's actual saved dietary preferences and avoid false refusals.
MODIFICATION_PROMPTS = [
    # (label, prompt)
    ("Mon dinner  → ribeye steak",
     f"Change dinner on {day(0)} to a ribeye steak."),

    ("Tue breakfast → bacon and eggs",
     f"Set breakfast on {day(1)} to bacon and scrambled eggs."),

    ("Wed lunch → grilled salmon",
     f"Add grilled salmon for lunch on {day(2)}."),

    ("Thu dinner → lamb chops",
     f"Replace dinner on {day(3)} with lamb chops."),

    ("Fri breakfast → beef patties",
     f"Plan breakfast on {day(4)} as beef patties with fried eggs."),

    ("Sat lunch → tuna steak",
     f"Change lunch on {day(5)} to a seared tuna steak."),

    ("Sun dinner → roast chicken",
     f"Set dinner on {day(6)} to roast chicken thighs."),

    ("Mon lunch → ground beef bowl",
     f"Add a ground beef bowl for lunch on {day(0)}."),

    ("Tue dinner → pork ribs",
     f"Plan dinner on {day(1)} as slow-cooked pork ribs."),

    ("Wed breakfast → smoked salmon",
     f"Change breakfast on {day(2)} to smoked salmon with soft-boiled eggs."),

    ("Thu lunch → chicken thighs",
     f"Set lunch on {day(3)} to pan-seared chicken thighs."),

    ("Fri dinner → baked cod",
     f"Replace dinner on {day(4)} with baked cod fillets."),

    ("Sat breakfast → steak and eggs",
     f"Add steak and eggs for breakfast on {day(5)}."),

    ("Sun lunch → shrimp",
     f"Change lunch on {day(6)} to pan-seared shrimp."),

    ("Mon breakfast → pork belly",
     f"Set breakfast on {day(0)} to crispy pork belly."),

    ("Tue lunch → beef brisket",
     f"Plan lunch on {day(1)} as sliced beef brisket."),

    ("Wed dinner → roasted duck",
     f"Add roasted duck breast for dinner on {day(2)}."),

    ("Thu breakfast → sardines and eggs",
     f"Change breakfast on {day(3)} to sardines with fried eggs."),

    ("Fri lunch → pork chops",
     f"Set lunch on {day(4)} to pan-seared pork chops."),

    ("Sat dinner → beef short ribs",
     f"Add beef short ribs for dinner on {day(5)}."),
]

# ── 3 date-omitting prompts (graceful-degradation test) ──────────────────────
DATELESS_PROMPTS = [
    ("No day — 'add steak'",
     "Add a steak to my meal plan."),
    ("No day — 'change dinner to salmon'",
     "Change dinner to salmon."),
    ("No day — 'plan breakfast as bacon and eggs'",
     "Plan breakfast as bacon and eggs."),
]


# ── HTTP helper ───────────────────────────────────────────────────────────────
def call_llm(prompt: str) -> tuple[int, str]:
    """POST to /api/llm with retry/backoff on rate-limit fallback. Never raises."""
    data = json.dumps({"message": prompt}).encode()
    for attempt in range(1, MAX_RETRIES + 1):
        req = urllib.request.Request(
            f"{BASE_URL}/api/llm",
            data=data,
            headers={"Content-Type": "application/json", "Cookie": SESSION_COOKIE},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                status = resp.status
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", errors="replace")
        except Exception as e:
            return 0, str(e)

        # Detect Gemini 429 fallback message and back off before retrying
        if body.strip() == RATE_LIMIT_RESPONSE:
            backoff = 15 * attempt
            if attempt < MAX_RETRIES:
                print(f"\n    ⏳ rate-limited (attempt {attempt}/{MAX_RETRIES}), "
                      f"waiting {backoff}s … ", end="", flush=True)
                time.sleep(backoff)
                continue
            else:
                return status, body   # give up after MAX_RETRIES

        return status, body

    return 0, RATE_LIMIT_RESPONSE  # should never reach here


# ── Block extraction & field checks ──────────────────────────────────────────
def extract_first_block(body: str) -> str | None:
    m = MEAL_ACTION_RE.search(body)
    return m.group(1).strip() if m else None


def check_block(raw_block: str) -> dict:
    """
    Returns a dict with keys:
      json_valid, date_ok, meal_type_ok, food_ok, parsed, error
    """
    result = {
        "json_valid": False,
        "date_ok": False,
        "meal_type_ok": False,
        "food_ok": False,
        "parsed": None,
        "error": None,
    }
    try:
        parsed = json.loads(raw_block)
        result["parsed"] = parsed
        result["json_valid"] = True
    except json.JSONDecodeError as e:
        result["error"] = f"JSON parse error: {e}"
        return result

    # date
    d = parsed.get("date")
    result["date_ok"] = isinstance(d, str) and bool(ISO_DATE_RE.match(d))

    action = parsed.get("action")

    if action == "set_meal":
        meal = parsed.get("meal") or {}
        mtype = meal.get("type")
        mname = meal.get("name")
        result["meal_type_ok"] = isinstance(mtype, str) and mtype in VALID_MEAL_TYPES
        result["food_ok"] = isinstance(mname, str) and mname.strip() != ""

    elif action == "clear_meal":
        # clear_meal has mealType at top level; no food name required
        mtype = parsed.get("mealType")
        result["meal_type_ok"] = isinstance(mtype, str) and mtype in VALID_MEAL_TYPES
        result["food_ok"] = True   # food not applicable for clear_meal

    else:
        result["error"] = f"Unknown action: {action!r}"

    return result


# ── Formatting helpers ────────────────────────────────────────────────────────
TICK = "✓"
CROSS = "✗"

def check_char(ok: bool) -> str:
    return TICK if ok else CROSS


def verdict(row: dict) -> str:
    if row.get("http_error"):
        return "FAIL(HTTP)"
    if not row["block_found"]:
        return "FAIL(no block)"
    c = row["checks"]
    if not c["json_valid"]:
        return "FAIL(JSON)"
    if not c["date_ok"]:
        return "FAIL(date)"
    if not c["meal_type_ok"]:
        return "FAIL(type)"
    if not c["food_ok"]:
        return "FAIL(food)"
    return "PASS"


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("\n" + "=" * 74)
    print("  STRUCTURAL ACCURACY TEST — POST /api/llm  <meal_action> blocks")
    print("=" * 74)
    print(f"\n  Checks per prompt: block present · JSON valid · date · meal_type · food")
    print(f"  Target: ≥ {int(ACCURACY_TARGET * 100)}% of 20 modification prompts PASS\n")

    # ── Phase 1: 20 modification prompts ─────────────────────────────────────
    print("── 20 meal-modification prompts ────────────────────────────────────\n")
    rows = []

    for i, (label, prompt) in enumerate(MODIFICATION_PROMPTS, 1):
        prefix = f"  [{i:02d}/20] {label:<30}"
        print(f"{prefix} … ", end="", flush=True)

        status, body = call_llm(prompt)
        time.sleep(INTER_REQUEST_DELAY)  # stay under Gemini 15 RPM quota

        row = {"label": label, "prompt": prompt, "status": status,
               "http_error": status not in (200, 201)}

        if row["http_error"]:
            row["block_found"] = False
            row["checks"] = {}
            rows.append(row)
            print(f"HTTP {status}  → FAIL(HTTP)")
            continue

        raw = extract_first_block(body)
        row["block_found"] = raw is not None

        if raw is None:
            row["checks"] = {}
            rows.append(row)
            print(f"no <meal_action> block  → FAIL(no block)")
            continue

        checks = check_block(raw)
        row["checks"] = checks
        rows.append(row)

        flags = (
            f"blk={TICK} "
            f"json={check_char(checks['json_valid'])} "
            f"date={check_char(checks['date_ok'])} "
            f"type={check_char(checks['meal_type_ok'])} "
            f"food={check_char(checks['food_ok'])}"
        )
        v = verdict(row)
        print(f"{flags}  → {v}")

    # ── Phase 2: 3 date-omitting prompts ─────────────────────────────────────
    print("\n── 3 date-omitting prompts (graceful-degradation check) ─────────────\n")
    dateless_rows = []

    for i, (label, prompt) in enumerate(DATELESS_PROMPTS, 1):
        prefix = f"  [{i}/3] {label:<35}"
        print(f"{prefix} … ", end="", flush=True)

        status, body = call_llm(prompt)
        time.sleep(INTER_REQUEST_DELAY)

        ok = status in (200, 201)
        is_error_json = False
        if ok:
            try:
                parsed_body = json.loads(body)
                if isinstance(parsed_body, dict) and "error" in parsed_body:
                    is_error_json = True
            except Exception:
                pass  # plain text response — fine

        raw = extract_first_block(body)
        has_block = raw is not None
        block_valid = False
        if has_block and raw:
            c = check_block(raw)
            block_valid = c["json_valid"] and c["date_ok"] and c["meal_type_ok"] and c["food_ok"]

        grace = "PASS" if (ok and not is_error_json) else "FAIL"
        detail_parts = [f"HTTP {status}"]
        if is_error_json:
            detail_parts.append("error body")
        if has_block:
            detail_parts.append(f"block={'valid' if block_valid else 'INVALID'}")
        else:
            detail_parts.append("no block (asked for clarification or picked a date — both OK)")
        dateless_rows.append({"label": label, "status": status, "grace": grace,
                               "has_block": has_block, "block_valid": block_valid})
        print(f"HTTP {status}  {'no block' if not has_block else 'block=' + ('valid' if block_valid else 'INVALID')}  → {grace}")

    # ── Summary table ─────────────────────────────────────────────────────────
    passes = sum(1 for r in rows if verdict(r) == "PASS")
    total  = len(rows)
    accuracy = passes / total if total else 0.0
    meets = accuracy >= ACCURACY_TARGET

    W = 74
    print(f"\n{'─' * W}")
    print(f"  RESULTS SUMMARY")
    print(f"{'─' * W}")
    print(f"  {'#':<4} {'Prompt label':<32} {'Status':>6}  {'Result'}")
    print(f"{'─' * W}")
    for i, row in enumerate(rows, 1):
        v = verdict(row)
        status_str = f"HTTP {row['status']}" if row["status"] else "ERROR"
        print(f"  {i:<4} {row['label']:<32} {status_str:>8}  {v}")
    print(f"{'─' * W}")
    flag = "✓ meets target" if meets else f"⚠ BELOW {int(ACCURACY_TARGET*100)}% TARGET"
    print(f"  Passed {passes}/{total}  —  accuracy {accuracy:.1%}  —  {flag}")
    print(f"{'─' * W}")

    print(f"\n  Graceful-degradation (date-omitting prompts):")
    all_grace = all(r["grace"] == "PASS" for r in dateless_rows)
    for r in dateless_rows:
        print(f"    {'✓' if r['grace']=='PASS' else '✗'} {r['label']:<40} HTTP {r['status']}  {r['grace']}")
    print(f"  {'✓ All 3 responded gracefully' if all_grace else '⚠ One or more graceful-degradation checks failed'}")

    if not meets:
        fail_rows = [r for r in rows if verdict(r) != "PASS"]
        print(f"\n  Failed prompts ({len(fail_rows)}):")
        for r in fail_rows:
            print(f"    • [{verdict(r)}] {r['label']}")
            if r.get("checks", {}).get("error"):
                print(f"      error: {r['checks']['error']}")

    print()


if __name__ == "__main__":
    main()
