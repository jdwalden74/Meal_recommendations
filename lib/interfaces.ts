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
  description?: string; // free-text summary, useful for LLM-generated meals
  nutrition: NutritionalInfo;
  ingredients?: string[];
  rating?: number;
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

// ─── LLM Actions ───────────────────────────────────────────────────────────────
// Typed contract for what the LLM emits in ChatMessage.structuredOutput.
// The chat API reads this field and calls PATCH /api/meal-plan accordingly.

export interface LlmMealAction {
  action: "set_meal";
  date: string;    // ISO date "YYYY-MM-DD"
  meal: Meal;      // full Meal object to insert/replace for that day
}

export interface LlmClearAction {
  action: "clear_meal";
  date: string;       // ISO date "YYYY-MM-DD"
  mealType: MealType; // which meal slot to remove
}

export type LlmAction = LlmMealAction | LlmClearAction;

// ─── Chat History ──────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  _id?: ObjectId;
  userId: string;   // matches session user email
  role: ChatRole;
  content: string;
  timestamp: Date;
  // Structured JSON payload the LLM emits to update the meal plan, if present
  structuredOutput?: LlmAction;
}

export interface MealRating {
  _id?: ObjectId;
  userId: string;
  mealId: string;
  mealName: string;
  rating: number; // 1–5
  nutrition: NutritionalInfo;
  ratedAt: Date;
}
