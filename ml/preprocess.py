"""
Preprocess USDA FoodData Central CSVs into a feature matrix for meal recommendations.

Reads from lib/ml/data/ relative to this script's parent directory.
Outputs ml/food_features.pkl and ml/food_features.csv.
"""

import pathlib
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "lib" / "ml" / "data"
OUT_DIR = ROOT / "ml"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
EXCLUDED_CATEGORIES = {3, 14, 27, 28}   # Baby Foods, Beverages, QC, Alcoholic Beverages

# Primary nutrient ID mapping
TARGET_NUTRIENTS = {
    1008: "calories",
    1003: "protein_g",
    1005: "carbs_g",
    1004: "fat_g",
    1079: "fiber_g",
    1093: "sodium_mg",
}

# The USDA dataset often stores energy under Atwater factor IDs instead of 1008.
# Collect all three and coalesce so each food gets one calorie value.
CALORIE_IDS = {1008, 2047, 2048}  # Energy / Atwater General / Atwater Specific

# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------
print("Loading CSVs...")
food = pd.read_csv(DATA_DIR / "food.csv", dtype={"fdc_id": int, "food_category_id": "Int64"})
food_nutrient = pd.read_csv(
    DATA_DIR / "food_nutrient.csv",
    usecols=["fdc_id", "nutrient_id", "amount"],
    dtype={"fdc_id": int, "nutrient_id": int, "amount": float},
)
food_category = pd.read_csv(DATA_DIR / "food_category.csv", dtype={"id": int})

# ---------------------------------------------------------------------------
# Filter foods
# ---------------------------------------------------------------------------
food = food[~food["food_category_id"].isin(EXCLUDED_CATEGORIES)].copy()
print(f"Foods after category filter: {len(food):,}")

# ---------------------------------------------------------------------------
# Extract target nutrients and pivot
# ---------------------------------------------------------------------------
all_target_ids = set(TARGET_NUTRIENTS) | CALORIE_IDS
nutrients = food_nutrient[food_nutrient["nutrient_id"].isin(all_target_ids)]
nutrients = nutrients[nutrients["fdc_id"].isin(food["fdc_id"])]

# Map Atwater IDs to the same "calories" column so they merge with 1008
calorie_map = {nid: "calories" for nid in CALORIE_IDS}
nutrient_id_to_col = {**TARGET_NUTRIENTS, **calorie_map}
nutrients = nutrients.copy()
nutrients["col"] = nutrients["nutrient_id"].map(nutrient_id_to_col)

pivot = (
    nutrients
    .pivot_table(index="fdc_id", columns="col", values="amount", aggfunc="mean")
    .reset_index()
)

# Ensure all expected columns exist
for col in TARGET_NUTRIENTS.values():
    if col not in pivot.columns:
        pivot[col] = float("nan")

# ---------------------------------------------------------------------------
# Merge food metadata with nutrient pivot
# ---------------------------------------------------------------------------
df = food[["fdc_id", "description", "food_category_id"]].merge(pivot, on="fdc_id", how="left")

# Drop rows without calorie data — unusable for recommendations
df = df.dropna(subset=["calories"])
print(f"Foods after dropping missing calories: {len(df):,}")

# Fill remaining missing nutrient values with 0
nutrient_cols = list(TARGET_NUTRIENTS.values())
df[nutrient_cols] = df[nutrient_cols].fillna(0)

# ---------------------------------------------------------------------------
# One-hot encode food_category_id
# ---------------------------------------------------------------------------
category_map = food_category.set_index("id")["description"].to_dict()
df["food_category_id"] = df["food_category_id"].astype(int)

category_dummies = pd.get_dummies(
    df["food_category_id"].map(lambda cid: category_map.get(cid, f"category_{cid}")),
    prefix="cat",
)
df = pd.concat([df.drop(columns=["food_category_id"]), category_dummies], axis=1)

# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------
OUT_DIR.mkdir(exist_ok=True)

pkl_path = OUT_DIR / "food_features.pkl"
csv_path = OUT_DIR / "food_features.csv"

df.to_pickle(pkl_path)
df.to_csv(csv_path, index=False)

print(f"Saved {len(df):,} rows x {len(df.columns)} columns")
print(f"  {pkl_path}")
print(f"  {csv_path}")
