"""
FastAPI recommendation service.

Startup: loads recommender.pkl, scaler.pkl, food_index.pkl from the same directory.
POST /recommend — returns top-N foods matching caloric target, dietary
                  restrictions, allergies, and (optionally) past rated meals.
"""

import pathlib
import pickle
import re
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ML_DIR = pathlib.Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Feature column order — must match what train.py used to fit the scaler
# ---------------------------------------------------------------------------
NUTRIENT_COLS = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg"]
CAT_COLS = [
    "cat_Baked Products",
    "cat_Beef Products",
    "cat_Cereal Grains and Pasta",
    "cat_Dairy and Egg Products",
    "cat_Fats and Oils",
    "cat_Finfish and Shellfish Products",
    "cat_Fruits and Fruit Juices",
    "cat_Lamb, Veal, and Game Products",
    "cat_Legumes and Legume Products",
    "cat_Nut and Seed Products",
    "cat_Pork Products",
    "cat_Poultry Products",
    "cat_Restaurant Foods",
    "cat_Sausages and Luncheon Meats",
    "cat_Soups, Sauces, and Gravies",
    "cat_Spices and Herbs",
    "cat_Sweets",
    "cat_Vegetables and Vegetable Products",
]
FEATURE_COLS = NUTRIENT_COLS + CAT_COLS

# ---------------------------------------------------------------------------
# Dietary restriction → category names to exclude
# Category IDs per spec; mapped to the string labels used in food_index.
# ---------------------------------------------------------------------------
RESTRICTION_EXCLUSIONS: dict[str, set[str]] = {
    "vegetarian": {
        "Poultry Products",           # ID 5
        "Sausages and Luncheon Meats",  # ID 7
        "Pork Products",              # ID 10
        "Beef Products",              # ID 13
        "Lamb, Veal, and Game Products",  # ID 17
    },
    "vegan": {
        "Poultry Products",
        "Sausages and Luncheon Meats",
        "Pork Products",
        "Beef Products",
        "Lamb, Veal, and Game Products",
        "Dairy and Egg Products",     # ID 1
    },
}

# ---------------------------------------------------------------------------
# Application state
# ---------------------------------------------------------------------------
class AppState:
    model = None
    scaler = None
    food_index: pd.DataFrame = None
    X_scaled: np.ndarray = None   # pre-scaled matrix for KNN queries


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML artifacts once at startup."""
    print("Loading ML artifacts...")
    with open(ML_DIR / "recommender.pkl", "rb") as f:
        state.model = pickle.load(f)
    with open(ML_DIR / "scaler.pkl", "rb") as f:
        state.scaler = pickle.load(f)
    with open(ML_DIR / "food_index.pkl", "rb") as f:
        state.food_index = pickle.load(f)

    # Pre-scale the food feature matrix so queries are fast
    nutrient_matrix = state.food_index[NUTRIENT_COLS].values
    cat_matrix = np.zeros((len(state.food_index), len(CAT_COLS)), dtype=float)
    for i, col in enumerate(CAT_COLS):
        cat_name = col.removeprefix("cat_")
        cat_matrix[:, i] = (state.food_index["category"] == cat_name).astype(float)
    state.X_scaled = state.scaler.transform(
        np.hstack([nutrient_matrix, cat_matrix])
    )
    print(f"Ready — {len(state.food_index)} foods indexed.")
    yield


app = FastAPI(title="Meal Recommender", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    """Liveness + readiness check. Returns 503 if artifacts are not loaded."""
    if state.model is None or state.scaler is None or state.food_index is None:
        from fastapi.responses import JSONResponse
        return JSONResponse({"status": "loading"}, status_code=503)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class NutritionInfo(BaseModel):
    calories: float = 0.0
    protein: float = 0.0
    carbs: float = 0.0
    fat: float = 0.0


class RatedMeal(BaseModel):
    name: str
    rating: float = Field(..., ge=1, le=5)
    nutrition: NutritionInfo


class RecommendRequest(BaseModel):
    caloric_target: float = Field(..., gt=0)
    dietary_restrictions: list[str] = []
    allergies: list[str] = []
    top_n: int = Field(default=10, ge=1, le=50)
    rated_meals: list[RatedMeal] = []


class FoodResult(BaseModel):
    name: str
    category: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float


# ---------------------------------------------------------------------------
# Helper: build query vector
# ---------------------------------------------------------------------------
def build_query_vector(request: RecommendRequest) -> np.ndarray:
    """Return an unscaled feature vector (24-dim) for the request."""
    per_meal_calories = request.caloric_target / 3.0

    # Base vector: target per-meal calories, all other nutrients zero
    base = np.zeros(len(FEATURE_COLS), dtype=float)
    base[0] = per_meal_calories  # calories index

    # Blend with weighted nutritional profile of highly-rated meals (4–5 stars)
    high_rated = [m for m in request.rated_meals if m.rating >= 4]
    if high_rated:
        weights = np.array([m.rating for m in high_rated], dtype=float)
        weights /= weights.sum()

        profile = np.zeros(len(FEATURE_COLS), dtype=float)
        for meal, w in zip(high_rated, weights):
            n = meal.nutrition
            profile[0] += w * n.calories   # calories
            profile[1] += w * n.protein    # protein_g
            profile[2] += w * n.carbs      # carbs_g
            profile[3] += w * n.fat        # fat_g
            # fiber_g (index 4) and sodium_mg (index 5) not in RatedMeal; stay 0

        # 50/50 blend: base supplies the caloric anchor, profile supplies macro shape
        base = 0.5 * base + 0.5 * profile

    return base


# ---------------------------------------------------------------------------
# Helper: build exclusion mask
# ---------------------------------------------------------------------------
def build_exclusion_mask(request: RecommendRequest) -> np.ndarray:
    """Return a boolean array, True where a food should be excluded."""
    idx = state.food_index
    excluded = np.zeros(len(idx), dtype=bool)

    # Dietary restriction category exclusions
    excluded_categories: set[str] = set()
    for restriction in request.dietary_restrictions:
        excluded_categories |= RESTRICTION_EXCLUSIONS.get(restriction.lower(), set())
    if excluded_categories:
        excluded |= idx["category"].isin(excluded_categories).values

    # Allergy name exclusions (case-insensitive substring match)
    for allergen in request.allergies:
        pattern = re.compile(re.escape(allergen), re.IGNORECASE)
        excluded |= idx["name"].apply(lambda n: bool(pattern.search(n))).values

    return excluded


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@app.post("/recommend", response_model=list[FoodResult])
def recommend(request: RecommendRequest):
    query_raw = build_query_vector(request)
    query_scaled = state.scaler.transform(query_raw.reshape(1, -1))

    exclusion_mask = build_exclusion_mask(request)
    n_available = int((~exclusion_mask).sum())
    if n_available == 0:
        raise HTTPException(
            status_code=422,
            detail="No foods remain after applying dietary restrictions and allergy filters.",
        )

    # Query enough neighbors to have top_n left after filtering.
    # The model was fit with n_neighbors=20; kneighbors() accepts an override.
    k = min(len(state.food_index), max(request.top_n * 4, 40))
    distances, indices = state.model.kneighbors(query_scaled, n_neighbors=k)

    results: list[FoodResult] = []
    for idx_pos in indices[0]:
        if exclusion_mask[idx_pos]:
            continue
        row = state.food_index.iloc[idx_pos]
        results.append(
            FoodResult(
                name=row["name"],
                category=row["category"],
                calories=round(row["calories"], 1),
                protein_g=round(row["protein_g"], 2),
                carbs_g=round(row["carbs_g"], 2),
                fat_g=round(row["fat_g"], 2),
                fiber_g=round(row["fiber_g"], 2),
            )
        )
        if len(results) >= request.top_n:
            break

    return results
