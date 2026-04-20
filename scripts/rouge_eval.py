#!/usr/bin/env python3
"""
ROUGE-1 / ROUGE-2 recall evaluation for POST /api/llm.

Self-consistency mode (synthetic references):
  Phase 1 — send each prompt once, collect responses as gold references.
  Phase 2 — send each prompt again, score responses against those references.

This measures output stability, not quality vs. human-written answers.
Swap REFERENCES (written after Phase 1) with human references to measure quality.

Targets: ROUGE-1 recall ≥ 0.74, ROUGE-2 recall ≥ 0.51
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request

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

ROUGE1_TARGET = 0.74
ROUGE2_TARGET = 0.51

# 6 meal-planning prompts chosen to exercise different response styles:
# single-meal, multi-day, constraint-based, preference-based, nutritional, conversational.
PROMPTS = [
    "Suggest a healthy breakfast for tomorrow.",
    "Plan dinner for the next three days.",
    "What's a good high-protein lunch I could make in under 30 minutes?",
    "Give me a light meal for tonight — something under 500 calories.",
    "What should I eat for breakfast this week? Keep it varied.",
    "Suggest a balanced meal plan for tomorrow — breakfast, lunch, and dinner.",
]

MEAL_ACTION_RE = re.compile(r"<meal_action>[\s\S]*?</meal_action>", re.IGNORECASE)


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------
def call_llm(prompt: str) -> str:
    data = json.dumps({"message": prompt}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/api/llm",
        data=data,
        headers={"Content-Type": "application/json", "Cookie": SESSION_COOKIE},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    # Strip structured meal-action blocks — score natural-language text only
    cleaned = MEAL_ACTION_RE.sub("", raw).strip()
    # Collapse excess whitespace left by removed blocks
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


# ---------------------------------------------------------------------------
# Simple ROUGE recall (no stemming — pure token overlap)
# ---------------------------------------------------------------------------
def tokenize(text: str) -> list[str]:
    return re.findall(r"\b\w+\b", text.lower())


def ngrams(tokens: list[str], n: int) -> list[tuple]:
    return [tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]


def rouge_recall(hypothesis: str, reference: str, n: int) -> float:
    ref_tokens = tokenize(reference)
    hyp_tokens = tokenize(hypothesis)
    if not ref_tokens:
        return 0.0
    ref_ng = ngrams(ref_tokens, n)
    hyp_ng = ngrams(hyp_tokens, n)
    if not ref_ng:
        return 0.0
    ref_counts: dict[tuple, int] = {}
    for g in ref_ng:
        ref_counts[g] = ref_counts.get(g, 0) + 1
    hyp_counts: dict[tuple, int] = {}
    for g in hyp_ng:
        hyp_counts[g] = hyp_counts.get(g, 0) + 1
    overlap = sum(min(hyp_counts.get(g, 0), c) for g, c in ref_counts.items())
    return overlap / len(ref_ng)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    try:
        from rouge_score import rouge_scorer as rs_mod

        scorer = rs_mod.RougeScorer(["rouge1", "rouge2"], use_stemmer=True)

        def score(hyp: str, ref: str):
            s = scorer.score(ref, hyp)
            return s["rouge1"].recall, s["rouge2"].recall

    except ImportError:
        print("rouge-score not found — falling back to built-in token overlap.")

        def score(hyp: str, ref: str):
            return rouge_recall(hyp, ref, 1), rouge_recall(hyp, ref, 2)

    print("\n" + "=" * 68)
    print("  ROUGE SELF-CONSISTENCY EVALUATION  —  POST /api/llm")
    print("=" * 68)
    print(
        "\n  NOTE: synthetic-reference mode. Phase 1 responses become the gold\n"
        "  standard. Scores measure output stability, not factual quality.\n"
        "  Swap references with human-written answers to measure quality.\n"
    )
    print(f"  Targets:  ROUGE-1 recall ≥ {ROUGE1_TARGET}   ROUGE-2 recall ≥ {ROUGE2_TARGET}\n")

    # ── Phase 1: collect references ──────────────────────────────────────────
    print("── Phase 1: collecting reference responses ─────────────────────────")
    references = []
    for i, prompt in enumerate(PROMPTS, 1):
        print(f"  [{i}/{len(PROMPTS)}] {prompt[:60]!r} … ", end="", flush=True)
        try:
            ref = call_llm(prompt)
            references.append(ref)
            print(f"ok ({len(ref)} chars)")
        except Exception as e:
            print(f"ERROR: {e}")
            references.append("")
        time.sleep(1)   # be kind to the LLM rate limiter

    # ── Phase 2: score hypotheses against references ──────────────────────────
    print("\n── Phase 2: scoring hypothesis responses ───────────────────────────")
    r1_scores, r2_scores = [], []
    rows = []

    for i, (prompt, reference) in enumerate(zip(PROMPTS, references), 1):
        print(f"  [{i}/{len(PROMPTS)}] {prompt[:60]!r} … ", end="", flush=True)
        if not reference:
            print("skipped (no reference)")
            rows.append({"prompt": prompt, "r1": None, "r2": None, "err": "no reference"})
            continue
        try:
            hypothesis = call_llm(prompt)
            r1, r2 = score(hypothesis, reference)
            r1_scores.append(r1)
            r2_scores.append(r2)
            rows.append({"prompt": prompt, "r1": r1, "r2": r2, "err": None,
                         "hyp_chars": len(hypothesis), "ref_chars": len(reference)})
            print(f"ROUGE-1={r1:.3f}  ROUGE-2={r2:.3f}")
        except Exception as e:
            print(f"ERROR: {e}")
            rows.append({"prompt": prompt, "r1": None, "r2": None, "err": str(e)})
        time.sleep(1)

    # ── Results table ─────────────────────────────────────────────────────────
    W = 72
    print(f"\n┌{'─' * W}┐")
    print(f"│{'PER-PROMPT ROUGE RECALL SCORES':^{W}}│")
    print(f"├{'─' * W}┤")
    print(f"│  {'#':<3} {'Prompt':<46} {'R-1':>7} {'R-2':>7} {'Flag':<6}│")
    print(f"├{'─' * W}┤")

    for i, row in enumerate(rows, 1):
        if row["r1"] is None:
            flag = "ERR"
            r1_str = "  —    "
            r2_str = "  —    "
        else:
            r1_miss = row["r1"] < ROUGE1_TARGET
            r2_miss = row["r2"] < ROUGE2_TARGET
            flag = ("⚠" if (r1_miss or r2_miss) else "✓")
            r1_str = f"{row['r1']:7.3f}"
            r2_str = f"{row['r2']:7.3f}"
        print(f"│  {i:<3} {row['prompt'][:46]:<46} {r1_str} {r2_str} {flag:<5} │")

    print(f"├{'─' * W}┤")

    if r1_scores:
        mean_r1 = sum(r1_scores) / len(r1_scores)
        mean_r2 = sum(r2_scores) / len(r2_scores)
        r1_flag = "⚠ BELOW TARGET" if mean_r1 < ROUGE1_TARGET else "✓ meets target"
        r2_flag = "⚠ BELOW TARGET" if mean_r2 < ROUGE2_TARGET else "✓ meets target"
        print(f"│  {'Mean ROUGE-1 recall:':<22} {mean_r1:6.3f}   {r1_flag:<{W - 33}}│")
        print(f"│  {'Mean ROUGE-2 recall:':<22} {mean_r2:6.3f}   {r2_flag:<{W - 33}}│")
    else:
        print(f"│  No successful pairs to score.{' ' * (W - 31)}│")

    print(f"└{'─' * W}┘")

    if r1_scores:
        print(
            f"\n  Scored {len(r1_scores)}/{len(PROMPTS)} prompt pairs successfully.\n"
            f"  Min ROUGE-1={min(r1_scores):.3f}  Max ROUGE-1={max(r1_scores):.3f}\n"
            f"  Min ROUGE-2={min(r2_scores):.3f}  Max ROUGE-2={max(r2_scores):.3f}"
        )
        if mean_r1 < ROUGE1_TARGET or mean_r2 < ROUGE2_TARGET:
            print(
                "\n  Interpretation: low self-consistency means the LLM gives\n"
                "  substantially different natural-language wording for the same\n"
                "  prompt on successive calls — typical for generative models.\n"
                "  Consider tightening temperature or adding response format\n"
                "  constraints if stable phrasing is required."
            )
        else:
            print(
                "\n  Interpretation: scores meet targets, indicating the model\n"
                "  produces stable natural-language phrasing across calls for\n"
                "  these prompt types."
            )
    print()


if __name__ == "__main__":
    main()
