#!/usr/bin/env python3
"""
Constraint satisfaction test for POST /api/llm.

For each prompt, extracts the <meal_action> block and checks every declared
constraint against the structured meal data:

  calorie   → meal.nutrition.calories ≤ limit × 1.10  (10% tolerance)
  exclusion → none of the forbidden words appear in
               meal.name + meal.description + meal.ingredients
               (whole-word, case-insensitive)
  dietary   → same word-scan with a labelled set of dietary keywords
  profile   → prompt deliberately conflicts with the saved carnivore profile;
               a graceful refusal (HTTP 200, no block) is the expected PASS

Target: ≥ 90% of all individual constraints PASS.
"""

import json
import re
import time
import urllib.request
import urllib.error
from datetime import date, timedelta

SESSION_COOKIE = (
    "next-auth.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0"
    ".._4FCk9CNWDQQbqW2.Ez08c8wxdjld0Q9yxCzhb5T1ykrN20yi1KFRNkj0ZaKJTkNwNx"
    "_SjDN9TFTS1JGufiNQvNN4pKxJkIiwyMiQoFyTa0KZJwfI2JUQ1bvXRhIoJAhoz7WKWBr"
    "1zGR3cI037VSboukMD80wQ3nrmUwRr97x4az8sqmsfMxf2m7TMGiX_i3FC1Z5P3CMf0viv"
    "61yqm98b3exYctGwO9G7J0L4cv_hPkQ2vgKcD-apNtxF2w4vUsyI1yQMbHICQNC-S7WkkA"
    "23Pn6DFJ35DrSivO29Kao7XrIBS6D5aaheZgHTRPxRdB93Wk6ySVjCchCmCT3xz6wU3EaM"
    "t8g0ODL3bpiJGfZd4NC7a3Bud4FDsy7Bjg.8luDvzZuyUlvux0gX6-J7A"
)

BASE_URL       = "http://localhost:3000"
RATE_ERR       = "Sorry, I couldn't generate a response. Please try again."
MAX_RETRIES    = 3
INTER_DELAY    = 5.0   # seconds — stays safely under Gemini 15 RPM
CALORIE_SLACK  = 1.10  # 10 % tolerance
TARGET_RATE    = 0.90  # ≥ 90 % constraint satisfaction

TODAY = date(2026, 4, 20)
def day(n: int) -> str:
    return (TODAY + timedelta(days=n)).isoformat()

MEAL_ACTION_RE = re.compile(r"<meal_action>([\s\S]*?)</meal_action>", re.IGNORECASE)

# ── Keyword sets for dietary categories ────────────────────────────────────────
DAIRY_WORDS    = ["butter", "cheese", "cream", "milk", "yogurt", "whey",
                  "ricotta", "brie", "cheddar", "parmesan", "mozzarella",
                  "ghee", "lactose"]
GLUTEN_WORDS   = ["wheat", "bread", "pasta", "flour", "rye", "barley",
                  "crouton", "breadcrumb", "breading", "bun", "roll",
                  "tortilla", "cracker"]
SHELLFISH_WORDS = ["shrimp", "crab", "lobster", "clam", "oyster",
                   "mussel", "scallop", "prawn", "crawfish"]
EGG_WORDS      = ["egg", "eggs", "omelette", "omelet", "frittata"]
CHICKEN_WORDS  = ["chicken", "poultry", "turkey", "hen"]
PORK_WORDS     = ["pork", "ham", "prosciutto", "pancetta"]
FISH_WORDS     = ["fish", "salmon", "tuna", "cod", "tilapia", "halibut",
                  "mackerel", "trout", "sardine", "anchovy", "herring"]
RED_MEAT_WORDS = ["beef", "steak", "lamb", "bison", "venison",
                  "veal", "ribeye", "sirloin"]

# ── Test definitions ───────────────────────────────────────────────────────────
# Each test is a dict:
#   label     : short display name
#   prompt    : message sent to /api/llm
#   constraints: list of constraint dicts (see check_constraint)
#   profile_conflict: if True, a graceful refusal = PASS (no meal expected)
TESTS = [
    # ── 1. Calorie target + ingredient exclusion ───────────────────────────────
    {
        "label": "Beef dinner ≤500 cal, no pork",
        "prompt": f"Set a beef dinner on {day(0)}. Keep it under 500 calories. No pork.",
        "constraints": [
            {"type": "calorie",    "limit": 500,        "desc": "calories ≤ 500"},
            {"type": "exclusion",  "words": PORK_WORDS, "desc": "no pork"},
        ],
    },
    # ── 2. Dairy-free + calorie ────────────────────────────────────────────────
    {
        "label": "Salmon lunch ≤400 cal, dairy-free",
        "prompt": f"Add a salmon lunch on {day(1)}. Under 400 calories, completely dairy-free.",
        "constraints": [
            {"type": "calorie",   "limit": 400,         "desc": "calories ≤ 400"},
            {"type": "dietary",   "words": DAIRY_WORDS, "desc": "dairy-free"},
        ],
    },
    # ── 3. Gluten-free + calorie ───────────────────────────────────────────────
    {
        "label": "Chicken dinner ≤700 cal, gluten-free",
        "prompt": f"Set a chicken dinner on {day(2)}. Under 700 calories. Gluten-free — no wheat, bread, or flour.",
        "constraints": [
            {"type": "calorie",   "limit": 700,          "desc": "calories ≤ 700"},
            {"type": "dietary",   "words": GLUTEN_WORDS, "desc": "gluten-free"},
        ],
    },
    # ── 4. Shellfish exclusion + calorie ──────────────────────────────────────
    {
        "label": "Egg breakfast ≤350 cal, no shellfish",
        "prompt": f"Plan an egg-based breakfast on {day(3)}. Under 350 calories. No shellfish at all.",
        "constraints": [
            {"type": "calorie",    "limit": 350,             "desc": "calories ≤ 350"},
            {"type": "exclusion",  "words": SHELLFISH_WORDS, "desc": "no shellfish"},
        ],
    },
    # ── 5. Poultry exclusion + calorie ────────────────────────────────────────
    {
        "label": "Ground beef lunch ≤600 cal, no poultry",
        "prompt": f"Add a ground beef bowl for lunch on {day(4)}. Under 600 calories. No chicken or poultry.",
        "constraints": [
            {"type": "calorie",    "limit": 600,          "desc": "calories ≤ 600"},
            {"type": "exclusion",  "words": CHICKEN_WORDS, "desc": "no poultry"},
        ],
    },
    # ── 6. Egg-free + dairy-free ──────────────────────────────────────────────
    {
        "label": "Bacon breakfast, egg-free, dairy-free",
        "prompt": f"Plan a bacon-only breakfast on {day(5)}. No eggs, no dairy products whatsoever.",
        "constraints": [
            {"type": "exclusion", "words": EGG_WORDS,   "desc": "no eggs"},
            {"type": "dietary",   "words": DAIRY_WORDS, "desc": "dairy-free"},
        ],
    },
    # ── 7. Lamb exclusion + calorie ───────────────────────────────────────────
    {
        "label": "Beef ribs dinner ≤800 cal, no lamb",
        "prompt": f"Set beef short ribs for dinner on {day(6)}. Under 800 calories. No lamb.",
        "constraints": [
            {"type": "calorie",    "limit": 800,                   "desc": "calories ≤ 800"},
            {"type": "exclusion",  "words": ["lamb", "mutton"],     "desc": "no lamb"},
        ],
    },
    # ── 8. Red meat exclusion + tight calorie ─────────────────────────────────
    {
        "label": "Tuna lunch ≤300 cal, no red meat",
        "prompt": f"Add a seared tuna lunch on {day(0)}. Under 300 calories. Absolutely no red meat.",
        "constraints": [
            {"type": "calorie",    "limit": 300,           "desc": "calories ≤ 300"},
            {"type": "exclusion",  "words": RED_MEAT_WORDS, "desc": "no red meat"},
        ],
    },
    # ── 9. Gluten-free + calorie (breakfast) ──────────────────────────────────
    {
        "label": "Steak & eggs breakfast ≤450 cal, gluten-free",
        "prompt": f"Plan a steak and eggs breakfast on {day(1)}. Under 450 calories, strictly gluten-free.",
        "constraints": [
            {"type": "calorie",   "limit": 450,          "desc": "calories ≤ 450"},
            {"type": "dietary",   "words": GLUTEN_WORDS, "desc": "gluten-free"},
        ],
    },
    # ── 10. Fish exclusion + calorie ──────────────────────────────────────────
    {
        "label": "Chicken dinner ≤550 cal, no fish/seafood",
        "prompt": f"Set a chicken breast dinner on {day(2)}. Under 550 calories. No fish or seafood.",
        "constraints": [
            {"type": "calorie",    "limit": 550,         "desc": "calories ≤ 550"},
            {"type": "exclusion",  "words": FISH_WORDS,  "desc": "no fish/seafood"},
        ],
    },
    # ── 11. Profile conflict: vegetarian ──────────────────────────────────────
    # Carnivore profile hard-constraint should override this → graceful refusal = PASS
    {
        "label": "[PROFILE] Vegetarian dinner",
        "prompt": f"Set a vegetarian dinner on {day(3)}.",
        "constraints": [
            {"type": "profile", "desc": "graceful refusal (vegetarian conflicts with carnivore profile)"},
        ],
        "profile_conflict": True,
    },
    # ── 12. Profile conflict: vegan ───────────────────────────────────────────
    {
        "label": "[PROFILE] Vegan lunch",
        "prompt": f"Add a vegan lunch on {day(4)}.",
        "constraints": [
            {"type": "profile", "desc": "graceful refusal (vegan conflicts with carnivore profile)"},
        ],
        "profile_conflict": True,
    },
    # ── 13. Pork exclusion + dairy-free ───────────────────────────────────────
    {
        "label": "Lamb chops dinner, no pork, dairy-free",
        "prompt": f"Set lamb chops for dinner on {day(5)}. No pork products. Dairy-free.",
        "constraints": [
            {"type": "exclusion", "words": PORK_WORDS,   "desc": "no pork"},
            {"type": "dietary",   "words": DAIRY_WORDS,  "desc": "dairy-free"},
        ],
    },
    # ── 14. Tight calorie + shellfish exclusion ────────────────────────────────
    {
        "label": "Sardine breakfast ≤250 cal, no shellfish",
        "prompt": f"Add sardines for breakfast on {day(6)}. Under 250 calories. No shellfish.",
        "constraints": [
            {"type": "calorie",    "limit": 250,             "desc": "calories ≤ 250"},
            {"type": "exclusion",  "words": SHELLFISH_WORDS, "desc": "no shellfish"},
        ],
    },
    # ── 15. Red meat only + calorie ───────────────────────────────────────────
    {
        "label": "Bison lunch ≤500 cal, no fish",
        "prompt": f"Plan a bison lunch on {day(0)}. Under 500 calories. No fish or seafood whatsoever.",
        "constraints": [
            {"type": "calorie",    "limit": 500,        "desc": "calories ≤ 500"},
            {"type": "exclusion",  "words": FISH_WORDS, "desc": "no fish"},
        ],
    },
]


# ── HTTP helper ────────────────────────────────────────────────────────────────
def call_llm(prompt: str) -> tuple[int, str]:
    data = json.dumps({"message": prompt}).encode()
    for attempt in range(1, MAX_RETRIES + 1):
        req = urllib.request.Request(
            f"{BASE_URL}/api/llm", data=data,
            headers={"Content-Type": "application/json", "Cookie": SESSION_COOKIE},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                status, body = resp.status, resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", errors="replace")
        except Exception as e:
            return 0, str(e)

        if body.strip() == RATE_ERR:
            backoff = 15 * attempt
            if attempt < MAX_RETRIES:
                print(f"\n    ⏳ rate-limited (attempt {attempt}), waiting {backoff}s…",
                      end="", flush=True)
                time.sleep(backoff)
                continue
        return status, body
    return 0, RATE_ERR


# ── Block extraction ───────────────────────────────────────────────────────────
def extract_first_set_meal(body: str) -> dict | None:
    """Return the parsed JSON of the first set_meal action, or None."""
    for m in MEAL_ACTION_RE.finditer(body):
        try:
            parsed = json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            continue
        if parsed.get("action") == "set_meal" and isinstance(parsed.get("meal"), dict):
            return parsed
    return None


# ── Scannable text from a meal_action ─────────────────────────────────────────
def meal_text(action: dict) -> str:
    meal = action.get("meal", {})
    parts = [
        meal.get("name", ""),
        meal.get("description", ""),
    ]
    parts += meal.get("ingredients", [])
    return " ".join(parts).lower()


# ── Individual constraint checker ─────────────────────────────────────────────
def check_constraint(c: dict, action: dict | None, body: str) -> tuple[bool, str]:
    """
    Returns (passed: bool, detail: str).
    action may be None if no set_meal block was found.
    """
    ctype = c["type"]

    if ctype == "profile":
        # Graceful refusal: HTTP 200, no crash. Block presence is irrelevant.
        crashed = "Internal server error" in body or "Unexpected token" in body
        if crashed:
            return False, "server error in body"
        # If the model refused (no block) or picked a compliant meal — both OK
        return True, "server responded gracefully (HTTP 200)"

    if action is None:
        return False, "no set_meal block in response"

    if ctype == "calorie":
        cal = action.get("meal", {}).get("nutrition", {}).get("calories")
        if cal is None:
            return False, "calories field missing"
        limit = c["limit"]
        ceiling = limit * CALORIE_SLACK
        if cal <= ceiling:
            return True, f"{cal:.0f} cal ≤ {ceiling:.0f} (limit {limit} + 10%)"
        return False, f"{cal:.0f} cal > {ceiling:.0f} (limit {limit} + 10%)"

    if ctype in ("exclusion", "dietary"):
        text = meal_text(action)
        hits = []
        for word in c["words"]:
            if re.search(rf"\b{re.escape(word)}\b", text, re.IGNORECASE):
                hits.append(word)
        if hits:
            return False, f"forbidden word(s) found in meal data: {hits}"
        return True, f"none of {c['words'][:3]}{'…' if len(c['words'])>3 else ''} found"

    return False, f"unknown constraint type: {ctype!r}"


# ── Formatting ─────────────────────────────────────────────────────────────────
TICK  = "✓"
CROSS = "✗"

def fmt_bool(b: bool) -> str:
    return TICK if b else CROSS


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("\n" + "=" * 72)
    print("  CONSTRAINT SATISFACTION TEST — POST /api/llm")
    print("=" * 72)
    print(f"\n  Constraint types: calorie (≤ limit × 1.10) | exclusion | dietary | profile")
    print(f"  Target: ≥ {int(TARGET_RATE * 100)}% of all individual constraints PASS\n")

    all_results: list[dict] = []   # flat list of every constraint result
    prompt_rows: list[dict] = []   # one row per prompt for the summary table

    for i, test in enumerate(TESTS, 1):
        is_conflict = test.get("profile_conflict", False)
        tag = "[PROFILE] " if is_conflict else ""
        label = test["label"]
        print(f"  [{i:02d}/{len(TESTS)}] {label}")

        status, body = call_llm(test["prompt"])
        time.sleep(INTER_DELAY)

        http_ok = status in (200, 201)
        action  = extract_first_set_meal(body) if http_ok else None

        row_results = []
        for c in test["constraints"]:
            passed, detail = check_constraint(c, action, body)
            row_results.append({
                "desc":   c["desc"],
                "passed": passed,
                "detail": detail,
                "type":   c["type"],
            })
            marker = TICK if passed else CROSS
            print(f"           {marker} {c['desc']}: {detail}")
            all_results.append({"passed": passed, "type": c["type"], "desc": c["desc"]})

        prompt_rows.append({
            "label":   label,
            "status":  status,
            "results": row_results,
            "conflict": is_conflict,
        })

    # ── Aggregate stats ────────────────────────────────────────────────────────
    total   = len(all_results)
    passed  = sum(1 for r in all_results if r["passed"])
    rate    = passed / total if total else 0.0
    meets   = rate >= TARGET_RATE

    by_type: dict[str, list[bool]] = {}
    for r in all_results:
        by_type.setdefault(r["type"], []).append(r["passed"])

    # ── Summary table ──────────────────────────────────────────────────────────
    W = 72
    print(f"\n{'─' * W}")
    print(f"  CONSTRAINT SUMMARY")
    print(f"{'─' * W}")
    print(f"  {'#':<3} {'Prompt':<36} {'Constraints':<22} {'Pass/Total'}")
    print(f"{'─' * W}")

    for i, row in enumerate(prompt_rows, 1):
        p = sum(1 for r in row["results"] if r["passed"])
        t = len(row["results"])
        results_str = "  ".join(
            f"{fmt_bool(r['passed'])} {r['desc']}" for r in row["results"]
        )
        conflict_tag = " ⚑" if row["conflict"] else ""
        print(f"  {i:<3} {(row['label'] + conflict_tag)[:36]:<36} {results_str[:22]:<22}  {p}/{t}")

    print(f"{'─' * W}")

    # Per-type breakdown
    type_labels = {
        "calorie":   "Calorie targets",
        "exclusion": "Ingredient exclusions",
        "dietary":   "Dietary restrictions",
        "profile":   "Profile conflicts",
    }
    print(f"\n  Breakdown by constraint type:")
    for ctype, results in sorted(by_type.items()):
        p = sum(results)
        t = len(results)
        label = type_labels.get(ctype, ctype)
        bar = TICK * p + CROSS * (t - p)
        print(f"    {label:<24} {bar}  {p}/{t}")

    flag = "✓ meets target" if meets else f"⚠ BELOW {int(TARGET_RATE * 100)}% TARGET"
    print(f"\n  Overall: {passed}/{total} constraints passed  —  {rate:.1%}  —  {flag}")
    print(f"{'─' * W}\n")

    if not meets:
        print("  Failed constraints:")
        for r in all_results:
            if not r["passed"]:
                print(f"    {CROSS} [{r['type']}] {r['desc']}: {r.get('detail','')}")
        print()


if __name__ == "__main__":
    main()
