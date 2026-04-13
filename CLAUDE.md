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

All MongoDB access goes through `lib/datalayer.ts`, which has four classes:
- `UserData` — user CRUD
- `UserPreferencesData` — dietary restrictions, allergies, cuisine prefs, caloric targets
- `MealPlanData` — weekly meal plans (7-day structure)
- `ChatHistoryData` — chat conversation persistence per user

### API Routes

| Route | Purpose |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth handler |
| `/api/chat` | LLM chat endpoint for meal recommendations |
| `/api/meal-plan` | CRUD for weekly meal plans |
| `/api/preferences` | User dietary preferences |
| `/api/login` | Custom login helpers |

### Key Types (`lib/interfaces.ts`)

- `MealStatus`: `"planned" | "in-progress" | "none"`
- `Meal` has a nested `NutritionalInfo` object
- `MealPlan` holds an array of `DayMeals` (7 days, each with breakfast/lunch/dinner)

### Environment Variables

Required in `.env.local`:
```
MONGODB_URI
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
```
