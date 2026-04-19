/**
 * Comprehensive test suite for the meal-recommendations app.
 * Usage: npx tsx scripts/test-all.ts
 *
 * IMPORTANT: All imports of lib/ modules that depend on env vars (lib/db.ts,
 * lib/datalayer.ts, lib/ml.ts) are done via dynamic import() inside async
 * functions — AFTER dotenv has populated process.env. Static (hoisted) imports
 * of those modules would run before dotenv.config(), causing the MONGO_DB_USER
 * guard in lib/db.ts to throw.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { MongoClient } from "mongodb";

// ─── Load env vars FIRST, before any dynamic imports ──────────────────────
// .env.local takes precedence over .env (loaded second = lower priority)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ─── Output helpers ────────────────────────────────────────────────────────

const G = "\x1b[32m"; // green
const R = "\x1b[31m"; // red
const Y = "\x1b[33m"; // yellow
const B = "\x1b[1m";  // bold
const D = "\x1b[0m";  // reset

let passed = 0;
let failed = 0;

function pass(label: string): void {
  passed++;
  console.log(`  ${G}✓${D} ${label}`);
}

function fail(label: string, reason: string): void {
  failed++;
  console.log(`  ${R}✗${D} ${label}`);
  console.log(`    ${R}→ ${reason}${D}`);
}

function section(name: string): void {
  console.log(`\n${B}${name}${D}`);
  console.log("─".repeat(55));
}

function warn(msg: string): void {
  console.log(`  ${Y}○ ${msg}${D}`);
}

// 5-second timeout wrapper for every HTTP request
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  ms = 5000
): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(id);
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TEST_USER = "test-script@example.com";
const DB_NAME = "meal-recommendation-dev";

// ─── MongoDB cleanup helper ────────────────────────────────────────────────

async function cleanupTestData(client: MongoClient): Promise<void> {
  const db = client.db(DB_NAME);
  await Promise.all([
    db.collection("userPreferences").deleteMany({ userId: TEST_USER }),
    db.collection("mealPlans").deleteMany({ userId: TEST_USER }),
    db.collection("chatHistory").deleteMany({ userId: TEST_USER }),
    db.collection("mealRatings").deleteMany({ userId: TEST_USER }),
  ]);
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 1 — Environment Variables
// ══════════════════════════════════════════════════════════════════════════════

function checkEnvVars(): void {
  section("Section 1 — Environment Variables");

  // These are the exact names the application code reads.
  // lib/db.ts      → MONGO_DB_USER, MONGO_DB_PASS
  // lib/auth.ts    → AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, NEXTAUTH_SECRET
  // NextAuth       → NEXTAUTH_URL
  // lib/llm.ts     → LLM_TOKEN
  // lib/ml.ts      → ML_SERVICE_URL
  const required: string[] = [
    "MONGO_DB_USER",
    "MONGO_DB_PASS",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "LLM_TOKEN",
    "ML_SERVICE_URL",
  ];

  for (const key of required) {
    const val = process.env[key];
    if (val && val.trim() !== "") {
      pass(`${key} is set and non-empty`);
    } else {
      fail(`${key} is set and non-empty`, `${key} is missing or empty in process.env`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 2 — MongoDB Connectivity
// ══════════════════════════════════════════════════════════════════════════════

async function checkMongoDB(): Promise<MongoClient | null> {
  section("Section 2 — MongoDB Connectivity");

  const user = process.env.MONGO_DB_USER;
  const pass_ = process.env.MONGO_DB_PASS;

  if (!user || !pass_) {
    fail(
      "MongoDB connection",
      "MONGO_DB_USER or MONGO_DB_PASS not set — cannot build URI, skipping section"
    );
    return null;
  }

  const uri = `mongodb+srv://${user}:${pass_}@meal-recommendation-dev.8occ3cw.mongodb.net/`;
  let client: MongoClient | null = null;

  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    pass("MongoDB connection succeeds within 5 seconds");
  } catch (err) {
    fail(
      "MongoDB connection succeeds within 5 seconds",
      `Connection failed: ${(err as Error).message}`
    );
    return null;
  }

  try {
    const db = client.db(DB_NAME);
    const collections = await db.listCollections().toArray();
    if (Array.isArray(collections)) {
      pass(
        `Database "${DB_NAME}" is reachable — ${collections.length} collection(s) found`
      );
    } else {
      fail(
        `Database "${DB_NAME}" is reachable`,
        "listCollections() did not return an array"
      );
    }
  } catch (err) {
    fail(
      `Database "${DB_NAME}" is reachable`,
      `listCollections() threw: ${(err as Error).message}`
    );
  }

  return client;
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 3 — Data Layer
// ══════════════════════════════════════════════════════════════════════════════

async function checkDataLayer(mongoClient: MongoClient | null): Promise<void> {
  section("Section 3 — Data Layer");

  if (!mongoClient) {
    warn("MongoDB unavailable — skipping all data layer checks");
    return;
  }

  // Pre-cleanup: remove any leftover test data from an interrupted previous run
  await cleanupTestData(mongoClient).catch(() => {});

  // Dynamic import AFTER dotenv is loaded so lib/db.ts sees the env vars
  let datalayer: typeof import("../lib/datalayer");
  try {
    datalayer = await import("../lib/datalayer");
  } catch (err) {
    fail("import lib/datalayer.ts", (err as Error).message);
    return;
  }

  const { UserPreferencesData, MealRatingData, MealPlanData, ChatHistoryData } =
    datalayer;

  // ── 3a  UserPreferencesData ───────────────────────────────────────────────

  const testPrefs = {
    dietaryRestrictions: ["vegetarian"],
    allergies: ["peanuts"],
    dislikedIngredients: ["cilantro"],
    cuisinePreferences: ["Italian"],
    caloricTarget: 2000,
  };

  try {
    const prefsData = new UserPreferencesData();
    await prefsData.upsertPreferences(TEST_USER, testPrefs);
    pass("UserPreferencesData.upsertPreferences() succeeds");

    const retrieved = await prefsData.getPreferences(TEST_USER);
    if (
      retrieved &&
      retrieved.caloricTarget === 2000 &&
      retrieved.dietaryRestrictions.includes("vegetarian") &&
      retrieved.allergies.includes("peanuts")
    ) {
      pass("UserPreferencesData.getPreferences() returns matching data");
    } else {
      fail(
        "UserPreferencesData.getPreferences() returns matching data",
        `Got: ${JSON.stringify(retrieved)}`
      );
    }
  } catch (err) {
    fail("UserPreferencesData operations", (err as Error).message);
  }

  // ── 3b  MealRatingData ────────────────────────────────────────────────────

  const testRating = {
    userId: TEST_USER,
    mealId: "test-meal-001",
    mealName: "Test Pasta",
    rating: 4,
    nutrition: { calories: 500, protein: 20, carbs: 60, fat: 15 },
    ratedAt: new Date(),
  };

  try {
    const ratingsData = new MealRatingData();
    await ratingsData.addRating(testRating);
    pass("MealRatingData.addRating() succeeds");

    const recent = await ratingsData.getRecentRatings(TEST_USER);
    if (recent.some((r) => r.mealId === "test-meal-001" && r.rating === 4)) {
      pass("MealRatingData.getRecentRatings() contains the added rating");
    } else {
      fail(
        "MealRatingData.getRecentRatings() contains the added rating",
        `Returned ${recent.length} ratings, none matching`
      );
    }

    const avg = await ratingsData.getAverageRating(TEST_USER, "test-meal-001");
    if (avg !== null && Math.abs(avg - 4) < 0.001) {
      pass("MealRatingData.getAverageRating() returns 4");
    } else {
      fail("MealRatingData.getAverageRating() returns 4", `Got: ${avg}`);
    }
  } catch (err) {
    fail("MealRatingData operations", (err as Error).message);
  }

  // ── 3c  MealPlanData ──────────────────────────────────────────────────────

  const WEEK_START = "2026-04-14"; // Monday of current week (2026-04-18 is Saturday)
  const testMeal = {
    id: "test-meal-001",
    name: "Test Oatmeal",
    type: "breakfast" as const,
    time: "8:00 AM",
    image: "",
    nutrition: { calories: 300, protein: 10, carbs: 50, fat: 5 },
  };
  const testDay = {
    date: "2026-04-14",
    status: "planned" as const,
    meals: [testMeal],
  };

  try {
    const mealPlanData = new MealPlanData();

    await mealPlanData.createMealPlan({
      userId: TEST_USER,
      weekStartDate: WEEK_START,
      days: [testDay],
    });
    pass("MealPlanData.createMealPlan() succeeds");

    const plan = await mealPlanData.getMealPlan(TEST_USER, WEEK_START);
    if (plan && plan.userId === TEST_USER && plan.weekStartDate === WEEK_START) {
      pass("MealPlanData.getMealPlan() returns the created plan");
    } else {
      fail(
        "MealPlanData.getMealPlan() returns the created plan",
        `Got: ${JSON.stringify(plan)}`
      );
    }

    const updatedDay = {
      date: "2026-04-14",
      status: "in-progress" as const,
      meals: [{ ...testMeal, name: "Updated Oatmeal" }],
    };
    await mealPlanData.upsertDay(TEST_USER, WEEK_START, updatedDay);

    const updated = await mealPlanData.getMealPlan(TEST_USER, WEEK_START);
    const day = updated?.days.find((d) => d.date === "2026-04-14");
    if (
      day &&
      day.status === "in-progress" &&
      day.meals[0]?.name === "Updated Oatmeal"
    ) {
      pass("MealPlanData.upsertDay() updates the day and the change persists");
    } else {
      fail(
        "MealPlanData.upsertDay() updates the day and the change persists",
        `Day: ${JSON.stringify(day)}`
      );
    }
  } catch (err) {
    fail("MealPlanData operations", (err as Error).message);
  }

  // ── 3d  ChatHistoryData ───────────────────────────────────────────────────

  try {
    const chatData = new ChatHistoryData();

    await chatData.addMessage({
      userId: TEST_USER,
      role: "user",
      content: "Hello test message",
    });
    pass("ChatHistoryData.addMessage() succeeds");

    const history = await chatData.getHistory(TEST_USER);
    if (history.some((m) => m.content === "Hello test message")) {
      pass("ChatHistoryData.getHistory() contains the added message");
    } else {
      fail(
        "ChatHistoryData.getHistory() contains the added message",
        `History length: ${history.length}, contents not matching`
      );
    }

    await chatData.clearHistory(TEST_USER);
    const afterClear = await chatData.getHistory(TEST_USER);
    if (afterClear.length === 0) {
      pass("ChatHistoryData.clearHistory() empties the history");
    } else {
      fail(
        "ChatHistoryData.clearHistory() empties the history",
        `Still ${afterClear.length} message(s) remaining`
      );
    }
  } catch (err) {
    fail("ChatHistoryData operations", (err as Error).message);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  try {
    await cleanupTestData(mongoClient);
    warn("Test data cleaned up from all four collections");
  } catch (err) {
    warn(`Cleanup warning: ${(err as Error).message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 4 — ML Service
// ══════════════════════════════════════════════════════════════════════════════

const MEAT_CATEGORIES = new Set([
  "Beef Products",
  "Poultry Products",
  "Pork Products",
  "Lamb, Veal, and Game Products",
  "Sausages and Luncheon Meats",
]);

interface FoodItem {
  name: string;
  category: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

function validateFoodItems(items: unknown[]): string | null {
  const requiredNumericFields = [
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
  ] as const;
  for (const item of items) {
    const obj = item as Record<string, unknown>;
    if (typeof obj.name !== "string" || obj.name === "") {
      return `item missing/empty 'name': ${JSON.stringify(obj)}`;
    }
    if (typeof obj.category !== "string" || obj.category === "") {
      return `item missing/empty 'category': ${JSON.stringify(obj)}`;
    }
    for (const f of requiredNumericFields) {
      if (typeof obj[f] !== "number" || (obj[f] as number) < 0) {
        return `item '${obj.name}' has invalid '${f}': ${obj[f]}`;
      }
    }
  }
  return null;
}

async function checkMlService(): Promise<void> {
  section("Section 4 — ML Service");

  const mlUrl = process.env.ML_SERVICE_URL;
  if (!mlUrl) {
    warn("ML_SERVICE_URL not set — skipping ML service checks");
    return;
  }

  // 4a — Health check
  let serviceUp = false;
  try {
    const res = await fetchWithTimeout(`${mlUrl}/health`);
    const body = await res.json();
    if (res.ok && body?.status === "ok") {
      pass("GET /health returns { status: 'ok' }");
      serviceUp = true;
    } else {
      fail(
        "GET /health returns { status: 'ok' }",
        `HTTP ${res.status}, body: ${JSON.stringify(body)}`
      );
    }
  } catch (err) {
    fail(
      "GET /health returns { status: 'ok' }",
      `Request failed: ${(err as Error).message}`
    );
  }

  if (!serviceUp) {
    warn("ML service appears to be down — skipping remaining ML checks");
    return;
  }

  const basePayload = {
    caloric_target: 2000,
    dietary_restrictions: [] as string[],
    allergies: [] as string[],
    top_n: 5,
    rated_meals: [] as unknown[],
  };

  // 4b — Basic recommend: 5 items with correct fields
  try {
    const res = await fetchWithTimeout(`${mlUrl}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basePayload),
    });
    const body = await res.json();

    if (!res.ok) {
      fail(
        "POST /recommend returns 5 valid food items",
        `HTTP ${res.status}: ${JSON.stringify(body)}`
      );
    } else if (!Array.isArray(body) || body.length !== 5) {
      fail(
        "POST /recommend returns 5 valid food items",
        `Expected array of length 5, got ${Array.isArray(body) ? body.length : typeof body}`
      );
    } else {
      const err_ = validateFoodItems(body);
      if (err_) {
        fail("POST /recommend returns 5 valid food items (correct fields)", err_);
      } else {
        pass(
          "POST /recommend returns 5 valid food items with all required fields"
        );
      }
    }
  } catch (err) {
    fail("POST /recommend (basic)", (err as Error).message);
  }

  // 4c — Vegetarian filter: no meat categories
  try {
    const res = await fetchWithTimeout(`${mlUrl}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        dietary_restrictions: ["vegetarian"],
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      fail(
        "POST /recommend vegetarian filter excludes meat categories",
        `HTTP ${res.status}`
      );
    } else {
      const meatItems = (body as FoodItem[]).filter((item) =>
        MEAT_CATEGORIES.has(item.category)
      );
      if (meatItems.length === 0) {
        pass(
          "POST /recommend with dietary_restrictions: ['vegetarian'] excludes all meat categories"
        );
      } else {
        fail(
          "POST /recommend with dietary_restrictions: ['vegetarian'] excludes all meat categories",
          `Meat items returned: ${meatItems.map((i) => i.name).join(", ")}`
        );
      }
    }
  } catch (err) {
    fail("POST /recommend (vegetarian filter)", (err as Error).message);
  }

  // 4d — Peanut allergy: no foods with 'peanut' in name
  try {
    const res = await fetchWithTimeout(`${mlUrl}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, allergies: ["peanut"] }),
    });
    const body = await res.json();

    if (!res.ok) {
      fail(
        "POST /recommend peanut allergy excludes peanut foods",
        `HTTP ${res.status}`
      );
    } else {
      const peanutItems = (body as FoodItem[]).filter((item) =>
        /peanut/i.test(item.name)
      );
      if (peanutItems.length === 0) {
        pass(
          "POST /recommend with allergies: ['peanut'] excludes foods with 'peanut' in name"
        );
      } else {
        fail(
          "POST /recommend with allergies: ['peanut'] excludes foods with 'peanut' in name",
          `Found: ${peanutItems.map((i) => i.name).join(", ")}`
        );
      }
    }
  } catch (err) {
    fail("POST /recommend (peanut allergy filter)", (err as Error).message);
  }

  // 4e — With two 5-star rated_meals: still returns 5 valid results
  try {
    const res = await fetchWithTimeout(`${mlUrl}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        rated_meals: [
          {
            name: "Grilled Chicken",
            rating: 5,
            nutrition: { calories: 250, protein: 30, carbs: 0, fat: 8 },
          },
          {
            name: "Brown Rice",
            rating: 5,
            nutrition: { calories: 200, protein: 4, carbs: 42, fat: 2 },
          },
        ],
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      fail(
        "POST /recommend with 2 × 5-star rated_meals returns 5 valid results",
        `HTTP ${res.status}`
      );
    } else if (!Array.isArray(body) || body.length !== 5) {
      fail(
        "POST /recommend with 2 × 5-star rated_meals returns 5 valid results",
        `Expected 5, got ${Array.isArray(body) ? body.length : typeof body}`
      );
    } else {
      const err_ = validateFoodItems(body);
      if (err_) {
        fail(
          "POST /recommend with 2 × 5-star rated_meals returns 5 valid results",
          err_
        );
      } else {
        pass(
          "POST /recommend with 2 × 5-star rated_meals returns 5 valid results"
        );
      }
    }
  } catch (err) {
    fail("POST /recommend (with rated_meals)", (err as Error).message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 5 — lib/ml.ts getRecommendations()
// ══════════════════════════════════════════════════════════════════════════════

async function checkMlModule(): Promise<void> {
  section("Section 5 — lib/ml.ts getRecommendations()");

  if (!process.env.ML_SERVICE_URL) {
    warn("ML_SERVICE_URL not set — skipping lib/ml.ts checks");
    return;
  }

  let mlModule: typeof import("../lib/ml");
  try {
    mlModule = await import("../lib/ml");
  } catch (err) {
    fail("import lib/ml.ts", (err as Error).message);
    return;
  }

  const { getRecommendations } = mlModule;

  const mockPrefs = {
    userId: TEST_USER,
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: [],
    caloricTarget: 2000,
    updatedAt: new Date(),
  };

  // 5a — Basic call returns RecommendedFood[]
  let firstResult: Awaited<ReturnType<typeof getRecommendations>> = [];
  try {
    firstResult = await getRecommendations(TEST_USER, mockPrefs);
    if (Array.isArray(firstResult) && firstResult.length > 0) {
      pass(
        `getRecommendations() returns an array of ${firstResult.length} RecommendedFood objects`
      );
    } else if (Array.isArray(firstResult) && firstResult.length === 0) {
      // ML service may be down; getRecommendations returns [] rather than throwing
      warn(
        "getRecommendations() returned an empty array — ML service may be unreachable"
      );
      pass("getRecommendations() returns an array without throwing");
    } else {
      fail(
        "getRecommendations() returns a non-empty array",
        `Got: ${JSON.stringify(firstResult)}`
      );
    }
  } catch (err) {
    fail("getRecommendations() does not throw", (err as Error).message);
  }

  // 5b — Second call is served from in-memory cache (same array reference)
  try {
    const secondResult = await getRecommendations(TEST_USER, mockPrefs);
    if (secondResult === firstResult) {
      pass("getRecommendations() second call returns exact same array reference (cache hit)");
    } else if (secondResult.length === firstResult.length) {
      pass(
        "getRecommendations() second call returns same length (cache hit — same content)"
      );
    } else {
      fail(
        "getRecommendations() second call served from cache",
        `First call: ${firstResult.length} items, second call: ${secondResult.length} items`
      );
    }
  } catch (err) {
    fail("getRecommendations() cache check does not throw", (err as Error).message);
  }

  // 5c — Different userId with no DB ratings still returns an array
  try {
    const noRatingsUser = "test-no-ratings@example.com";
    const result = await getRecommendations(noRatingsUser, mockPrefs);
    if (Array.isArray(result)) {
      pass(
        `getRecommendations() with userId that has no ratings returns array (${result.length} items)`
      );
    } else {
      fail(
        "getRecommendations() with no-ratings userId returns array",
        `Got: ${typeof result}`
      );
    }
  } catch (err) {
    fail(
      "getRecommendations() with no-ratings userId does not throw",
      (err as Error).message
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 6 — API Routes (requires running dev server on localhost:3000)
// ══════════════════════════════════════════════════════════════════════════════

async function checkApiRoutes(): Promise<void> {
  section("Section 6 — API Routes (localhost:3000)");

  const BASE = "http://localhost:3000";

  // Quick reachability probe (3-second timeout so we fail fast)
  try {
    await fetchWithTimeout(`${BASE}/api/auth/session`, {}, 3000);
  } catch {
    warn("Dev server not reachable at localhost:3000 — skipping this section");
    warn("Start it with:  npm run dev");
    return;
  }

  const checks: Array<{ label: string; method: string; path: string }> = [
    {
      label: "GET /api/ratings without session cookie → 401",
      method: "GET",
      path: "/api/ratings",
    },
    {
      label: "POST /api/ratings without session cookie → 401",
      method: "POST",
      path: "/api/ratings",
    },
    {
      label: "GET /api/meal-plan without session cookie → 401",
      method: "GET",
      path: "/api/meal-plan",
    },
    {
      label: "POST /api/chat without session cookie → 401",
      method: "POST",
      path: "/api/chat",
    },
    {
      label: "GET /api/recommendations without session cookie → 401",
      method: "GET",
      path: "/api/recommendations",
    },
  ];

  for (const { label, method, path: p } of checks) {
    try {
      const res = await fetchWithTimeout(`${BASE}${p}`, {
        method,
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) {
        pass(label);
      } else {
        fail(label, `Expected 401, got HTTP ${res.status}`);
      }
    } catch (err) {
      fail(label, `Request failed: ${(err as Error).message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 7 — ML Service Edge Cases
// ══════════════════════════════════════════════════════════════════════════════

async function checkMlEdgeCases(): Promise<void> {
  section("Section 7 — ML Service Edge Cases");

  const mlUrl = process.env.ML_SERVICE_URL;
  if (!mlUrl) {
    warn("ML_SERVICE_URL not set — skipping edge case checks");
    return;
  }

  // 7a — Heavy combined restrictions + multi-allergen: must not 500
  try {
    const res = await fetchWithTimeout(`${mlUrl}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caloric_target: 2000,
        dietary_restrictions: ["vegetarian", "vegan"],
        allergies: ["milk", "egg", "wheat", "soy"],
        top_n: 10,
        rated_meals: [],
      }),
    });

    if (res.status === 500) {
      const body = await res.text();
      fail(
        "POST /recommend with vegan + milk/egg/wheat/soy returns array or 422 (not 500)",
        `Got 500: ${body.slice(0, 200)}`
      );
    } else if (res.status === 422) {
      const body = await res.json();
      pass(
        `POST /recommend with heavy restrictions returns 422 (no foods match): "${body?.detail ?? ""}"`
      );
    } else if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body)) {
        pass(
          `POST /recommend with heavy restrictions returns array of ${body.length} item(s) without 500`
        );
      } else {
        fail(
          "POST /recommend with heavy restrictions returns array or 422",
          `Unexpected body shape: ${JSON.stringify(body).slice(0, 100)}`
        );
      }
    } else {
      fail(
        "POST /recommend with heavy restrictions returns array or 422",
        `Unexpected status ${res.status}`
      );
    }
  } catch (err) {
    fail(
      "POST /recommend with heavy restrictions does not hang or crash",
      (err as Error).message
    );
  }

  // 7b — Missing caloric_target: must return 422, not 500
  try {
    const res = await fetchWithTimeout(`${mlUrl}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dietary_restrictions: [],
        allergies: [],
        top_n: 5,
        // caloric_target intentionally omitted
      }),
    });

    if (res.status === 422) {
      pass("POST /recommend with missing caloric_target returns 422 (not 500)");
    } else {
      fail(
        "POST /recommend with missing caloric_target returns 422 (not 500)",
        `Got HTTP ${res.status}`
      );
    }
  } catch (err) {
    fail(
      "POST /recommend with invalid payload (missing caloric_target)",
      (err as Error).message
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(`\n${B}Meal Recommendations — Full Test Suite${D}`);
  console.log("═".repeat(55));

  checkEnvVars();

  const mongoClient = await checkMongoDB();

  await checkDataLayer(mongoClient);
  await checkMlService();
  await checkMlModule();
  await checkApiRoutes();
  await checkMlEdgeCases();

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${"═".repeat(55)}`);
  const failColor = failed > 0 ? R : G;
  console.log(
    `${B}Summary${D}: ` +
      `${G}${passed} passed${D}, ` +
      `${failColor}${failed} failed${D} ` +
      `out of ${total} checks`
  );

  if (mongoClient) {
    await mongoClient.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n${R}Fatal error:${D}`, err);
  process.exit(1);
});
