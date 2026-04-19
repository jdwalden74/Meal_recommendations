# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint check
```

## Architecture

This is a Next.js 15 App Router application for AI-powered personalized meal planning.

### Auth Flow

Authentication uses NextAuth v4 with Google OAuth (`lib/auth.ts`). The `middleware.ts` protects `/dashboard/*` and `/calendar/*` routes. Sessions use JWT strategy. On first Google sign-in, a user record is auto-created in MongoDB via the `UserData` class.

### Data Layer

All MongoDB access goes through `lib/datalayer.ts`, which has five classes:
- `UserData` — user CRUD
- `UserPreferencesData` — dietary restrictions, allergies, cuisine prefs, caloric targets
- `MealPlanData` — weekly meal plans (7-day structure)
- `ChatHistoryData` — chat conversation persistence per user
- `MealRatingData` — per-user meal ratings (1–5 stars), upserted by `(userId, mealId)`

### API Routes

| Route | Purpose |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth handler |
| `/api/chat` | LLM chat endpoint for meal recommendations |
| `/api/meal-plan` | CRUD for weekly meal plans |
| `/api/preferences` | User dietary preferences |
| `/api/ratings` | GET recent ratings; POST to upsert a meal rating |
| `/api/recommendations` | GET top-15 ML food recommendations for the current user |
| `/api/llm` | Streaming LLM endpoint (Gemini); parses `<meal_action>` blocks server-side |
| `/api/login` | Custom login helpers |

### Key Types (`lib/interfaces.ts`)

- `MealStatus`: `"planned" | "in-progress" | "none"`
- `Meal` has a nested `NutritionalInfo` object and an optional `rating?: number`
- `MealPlan` holds an array of `DayMeals` (7 days, each with breakfast/lunch/dinner)
- `MealRating` — persisted star rating linked to a meal by `mealId`
- `LlmAction` — union of `LlmMealAction` (`set_meal`) and `LlmClearAction` (`clear_meal`)

### ML Service (`ml/`)

A FastAPI service (Python) that runs separately from Next.js.

| Script | Purpose |
|---|---|
| `ml/preprocess.py` | Reads USDA CSVs from `lib/ml/data/`, builds `ml/food_features.pkl` |
| `ml/train.py` | Fits `NearestNeighbors` on the feature matrix, writes `ml/recommender.pkl`, `ml/scaler.pkl`, `ml/food_index.pkl` |
| `ml/main.py` | FastAPI app — `POST /recommend`, `GET /health` |

Run locally: `python3 ml/train.py && python3 -m uvicorn ml.main:app --port 8000`

### Environment Variables

Copy `.env.example` to `.env.local` and fill in all values. The names below are exactly what the code reads — do not substitute aliases.

| Variable | Read by | Notes |
|---|---|---|
| `MONGO_DB_USER` | `lib/db.ts` | MongoDB Atlas username |
| `MONGO_DB_PASS` | `lib/db.ts` | MongoDB Atlas password |
| `AUTH_GOOGLE_ID` | `lib/auth.ts` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | `lib/auth.ts` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | `lib/auth.ts` | JWT signing secret — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | NextAuth framework | Public base URL, e.g. `http://localhost:3000` |
| `LLM_TOKEN` | `lib/llm.ts` | Google Gemini API key |
| `ML_SERVICE_URL` | `lib/ml.ts` | Base URL of the FastAPI ML service, e.g. `http://localhost:8000` |
