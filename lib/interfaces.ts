import { ObjectId } from "mongodb";

// ─── User ──────────────────────────────────────────────────────────────────────

export interface User {
  _id?: ObjectId;
  fname: string;
  lname: string;
  email: string;
}

// ─── Meals ─────────────────────────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MealStatus = "planned" | "in-progress" | "none";

export interface NutritionalInfo {
  calories: number;
  protein: number; // grams
  carbs: number;   // grams
  fat: number;     // grams
  fiber?: number;  // grams
  sodium?: number; // milligrams
}

export interface Meal {
  id: string;
  name: string;
  type: MealType;
  time: string;
  image: string;
  nutrition: NutritionalInfo;
  ingredients?: string[];
}

// DayMeals uses an ISO date string so it serializes cleanly to/from MongoDB
export interface DayMeals {
  date: string; // ISO 8601 date string, e.g. "2026-04-14"
  status: MealStatus;
  meals: Meal[];
}

// ─── User Preferences ──────────────────────────────────────────────────────────

export interface UserPreferences {
  _id?: ObjectId;
  userId: string;                  // matches session user email
  dietaryRestrictions: string[];   // e.g. ["vegetarian", "keto", "halal"]
  allergies: string[];             // e.g. ["peanuts", "shellfish", "dairy"]
  dislikedIngredients: string[];   // ingredients to avoid in suggestions
  cuisinePreferences: string[];    // e.g. ["Italian", "Mexican", "Asian"]
  caloricTarget: number;           // daily calorie goal
  budgetPerWeek?: number;          // optional weekly grocery budget (USD)
  maxCookTimeMinutes?: number;     // optional max cook time per meal
  updatedAt: Date;
}

// ─── Meal Plan ─────────────────────────────────────────────────────────────────

export interface MealPlan {
  _id?: ObjectId;
  userId: string;        // matches session user email
  weekStartDate: string; // ISO date string for Monday of the planned week
  days: DayMeals[];      // 7 entries, one per day
  createdAt: Date;
  updatedAt: Date;
}

// ─── Chat History ──────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  _id?: ObjectId;
  userId: string;   // matches session user email
  role: ChatRole;
  content: string;
  timestamp: Date;
  // Structured JSON payload the LLM emits to update the meal plan, if present
  structuredOutput?: Record<string, unknown>;
}
