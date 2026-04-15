/**
 * Database initialization script.
 * Creates collections and indexes for the meal-recommendation-dev database.
 *
 * Usage:
 *   npx tsx scripts/init-db.ts
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { MONGODB_URI, MONGO_DB_USER, MONGO_DB_PASS } = process.env;

let uri: string;
if (MONGODB_URI) {
  uri = MONGODB_URI;
} else if (MONGO_DB_USER && MONGO_DB_PASS) {
  uri = `mongodb+srv://${MONGO_DB_USER}:${MONGO_DB_PASS}@meal-recommendation-dev.8occ3cw.mongodb.net/`;
} else {
  console.error("Missing MONGODB_URI (or MONGO_DB_USER + MONGO_DB_PASS) in .env.local");
  process.exit(1);
}
const DB_NAME = "meal-recommendation-dev";

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);

  // ── users ──────────────────────────────────────────────────────────────────
  await db.createCollection("users").catch(() => {});
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  console.log("✓ users collection ready");

  // ── userPreferences ────────────────────────────────────────────────────────
  await db.createCollection("userPreferences").catch(() => {});
  await db.collection("userPreferences").createIndex({ userId: 1 }, { unique: true });
  console.log("✓ userPreferences collection ready");

  // ── mealPlans ──────────────────────────────────────────────────────────────
  await db.createCollection("mealPlans").catch(() => {});

  // One plan per user per week — enforce at the DB level
  await db.collection("mealPlans").createIndex(
    { userId: 1, weekStartDate: 1 },
    { unique: true, name: "userId_weekStartDate_unique" }
  );

  // Fast lookup of all plans for a user (history view, calendar)
  await db.collection("mealPlans").createIndex(
    { userId: 1, weekStartDate: -1 },
    { name: "userId_weekStartDate_desc" }
  );

  console.log("✓ mealPlans collection ready");

  // ── chatHistory ────────────────────────────────────────────────────────────
  await db.createCollection("chatHistory").catch(() => {});
  await db.collection("chatHistory").createIndex({ userId: 1, timestamp: 1 });
  console.log("✓ chatHistory collection ready");

  await client.close();
  console.log("\nDatabase initialization complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
