# Cookbook Feature Plan

## Context

Adding a `/cookbook` page where signed-in users save their own recipes. The UX is a mobile-first book metaphor: recipes are "pages" you swipe through, with a table of contents, cook mode, servings scaler, ingredient checkboxes, shopping list, and full offline PWA support.

The app currently has no file upload infrastructure, no PWA setup, and no gesture library — all three need to be added.

---

## 1. Codebase Findings

### Auth pattern
- NextAuth v4, Google OAuth, JWT strategy. `lib/auth.ts`.
- All API routes call `getServerSession(authOptions)` → `session?.user?.email ?? null`. Return 401 if null.
- **userId = user's email** in every MongoDB document. Follow this exactly.
- `middleware.ts` protects routes with `withAuth`. Add `/cookbook` to the matcher.

### MongoDB pattern
- Client: `clientPromise` default-exported from `lib/db.ts`. DB name: `"meal-recommendation-dev"`.
- Data layer: classes extend `DataLayer` (base in `lib/datalayer.ts`), each with a private `collectionName` and `getCollection()` method. Existing: `users`, `userPreferences`, `mealPlans`, `chatHistory`, `mealRatings`.
- No Zod/Mongoose — TypeScript interfaces + manual API-level validation. Match this pattern.

### Macros
- Shape (`lib/interfaces.ts:17-24`): `{ calories: number, protein: number, carbs: number, fat: number, fiber?: number, sodium?: number }`. Units: kcal, grams, grams, grams, grams, mg.
- Source: Gemini LLM generates them via `<meal_action>` blocks in `/api/llm`. No dependency on FastAPI ML service or AWS ECS.
- Reuse `NutritionalInfo` type directly for per-serving recipe macros.

### Styling
- Tailwind CSS v4 + shadcn/ui (Radix UI primitives) + `lucide-react` icons.
- `cn()` from `lib/utils.ts`, CVA for variants. Dark mode via `dark:` prefix.
- `motion` / `framer-motion` v12.34.2 already installed and used in `app/page.tsx`.

### Nav
- `components/NavBar.tsx`. Desktop links ~line 40–105; mobile menu ~128–192.
- Add Cookbook after Profile in both sections. Icon: `BookOpen` from `lucide-react`.

### PWA
- **Not a PWA.** No manifest, no service worker, no `next-pwa`.

### Gestures
- `motion`/`framer-motion` v12.34.2 installed. No gesture library installed yet.

### File storage
- **Nothing exists.** `next.config.ts` only whitelists `lh3.googleusercontent.com` for images.

---

## 2. Photo Storage Decision: Vercel Blob

**Use `@vercel/blob`**, not MongoDB GridFS.

- App already uses `output: "standalone"` (Vercel-native). Blob integrates with no extra infra.
- GridFS requires streaming chunked reads and dedicated endpoints — significant added complexity.
- Blob gives a CDN-backed URL that can be passed directly to Next.js `<Image>` after adding `*.public.blob.vercel-storage.com` to `next.config.ts` remotePatterns.
- Upload flow: client POSTs multipart form to `/api/cookbook/upload` → server calls `put()` from `@vercel/blob` → returns URL stored in recipe document.

---

## 3. Data Models

### `Recipe` (new collection: `recipes`)
```typescript
interface RecipeIngredient {
  name: string;
  amount: number;
  unit: string;
}

interface Recipe {
  _id?: ObjectId;
  userId: string;           // session user email
  title: string;
  photoUrl?: string;        // Vercel Blob URL
  ingredients: RecipeIngredient[];
  steps: string[];
  servings: number;         // base serving count
  macros: NutritionalInfo;  // per-serving; reuse existing type
  tags: string[];
  notes?: string;
  isFavorite: boolean;
  lastCooked?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### `ShoppingList` (new collection: `shoppingLists`)
```typescript
interface ShoppingListItem {
  name: string;
  amount: number;
  unit: string;
  checked: boolean;
  recipeId?: string;        // optional source recipe reference
}

interface ShoppingList {
  _id?: ObjectId;
  userId: string;
  name: string;
  items: ShoppingListItem[];
  createdAt: Date;
  updatedAt: Date;
}
```

Add both interfaces to `lib/interfaces.ts`. Add `RecipeData` and `ShoppingListData` classes to `lib/datalayer.ts` following the existing class pattern.

---

## 4. API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/cookbook` | List user's recipes (query: `?search=`, `?tag=`, `?favorites=true`) |
| POST | `/api/cookbook` | Create recipe |
| GET | `/api/cookbook/[id]` | Get single recipe |
| PUT | `/api/cookbook/[id]` | Update recipe (all fields including `lastCooked`, `isFavorite`) |
| DELETE | `/api/cookbook/[id]` | Delete recipe |
| POST | `/api/cookbook/upload` | Upload photo → Vercel Blob → return `{ url }` |
| GET | `/api/shopping-list` | List user's shopping lists |
| POST | `/api/shopping-list` | Create list (accepts `recipeId` to pre-populate items) |
| PUT | `/api/shopping-list/[id]` | Update list (check/uncheck items, add/remove items) |
| DELETE | `/api/shopping-list/[id]` | Delete list |

All routes: same `getServerSession` → email → 401 pattern as existing routes.

---

## 5. Page and Component Structure

```
app/
  cookbook/
    page.tsx              # Table of contents: search, tag filter, favorites toggle
    new/
      page.tsx            # Create recipe (RecipeForm)
    [id]/
      page.tsx            # Book reader: RecipeBook with swipe navigation
      edit/
        page.tsx          # Edit recipe (RecipeForm prefilled)

components/
  cookbook/
    CookbookTOC.tsx       # Grid of RecipeCards + search bar + tag chips + favorites filter
    RecipeCard.tsx        # TOC card: photo thumb, title, tags, favorite star, last cooked
    RecipeBook.tsx        # Book-like reader — framer-motion drag/swipe for page-turns
    RecipeForm.tsx        # Shared create/edit form: all fields, PhotoUpload, macro inputs
    ServingsScaler.tsx    # Number input; scales ingredient amounts + macros proportionally
    IngredientList.tsx    # Ingredients with checkboxes (local state; cleared on unmount)
    CookMode.tsx          # Full-screen overlay: large text, keep-awake (WakeLock API), steps
    ShoppingListPanel.tsx # Slide-in panel: current shopping list with check/uncheck
    PhotoUpload.tsx       # <input type="file" accept="image/*" capture="environment">
                          # POSTs to /api/cookbook/upload, returns URL
```

### Page-turn animation
- `RecipeBook.tsx` uses `motion.div` with `drag="x"` and `onDragEnd` to detect swipe direction.
- Animate with `x` offset and `opacity` on transition to simulate a page flip.
- State: `currentIndex` in URL param (`?page=2`) so deep-linking works.

---

## 6. New Dependencies

| Package | Why |
|---------|-----|
| `@vercel/blob` | Photo upload/storage — fits Vercel-native stack, simple API, CDN-backed |
| `next-pwa` | Adds service worker + web app manifest to Next.js for offline support |

`framer-motion` is already installed — use it for page-turn drag animation. No additional gesture library needed; framer-motion's built-in `drag` prop is sufficient for swipe-to-turn-page.

---

## 7. PWA Setup

- Add `next-pwa` wrapping `nextConfig` in `next.config.ts`.
- Create `public/manifest.json` with `name`, `short_name`, `icons`, `display: "standalone"`, `theme_color`.
- Add metadata manifest reference in `app/layout.tsx`.
- Service worker caches cookbook pages and recipe assets for offline access.
- Cache-first strategy for `/api/cookbook` GET responses is sufficient for v1 offline support.

---

## 8. Files to Create / Modify

**Modify:**
- `middleware.ts` — add `/cookbook` to protected routes matcher
- `lib/interfaces.ts` — add `Recipe`, `RecipeIngredient`, `ShoppingList`, `ShoppingListItem`
- `lib/datalayer.ts` — add `RecipeData` and `ShoppingListData` classes
- `next.config.ts` — add `*.public.blob.vercel-storage.com` to image remotePatterns; wrap with `next-pwa`
- `components/NavBar.tsx` — add Cookbook nav link (desktop + mobile)
- `app/layout.tsx` — add PWA manifest link in metadata

**Create:**
- `app/cookbook/page.tsx`
- `app/cookbook/new/page.tsx`
- `app/cookbook/[id]/page.tsx`
- `app/cookbook/[id]/edit/page.tsx`
- `app/api/cookbook/route.ts`
- `app/api/cookbook/[id]/route.ts`
- `app/api/cookbook/upload/route.ts`
- `app/api/shopping-list/route.ts`
- `app/api/shopping-list/[id]/route.ts`
- `components/cookbook/` (all components listed above)
- `public/manifest.json`

---

## 9. Verification

1. `npm run lint` — no type errors
2. `npm run dev` — visit `/cookbook`, create a recipe with a photo, verify it persists after reload
3. Swipe between recipes on a mobile viewport in DevTools — page-turn animation fires
4. Toggle cook mode — screen stays awake (WakeLock), text is large
5. Scale servings — ingredient amounts and macros update proportionally
6. Add recipe to shopping list — items appear in ShoppingListPanel, can be checked off
7. Kill network in DevTools — previously visited recipes still load (PWA cache)
8. Add to home screen on mobile — app installs as standalone PWA
