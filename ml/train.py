"""
Train a NearestNeighbors recommender on the preprocessed food feature matrix.

Inputs:  ml/food_features.pkl
Outputs: ml/recommender.pkl  — fitted NearestNeighbors model
         ml/scaler.pkl       — fitted StandardScaler
         ml/food_index.pkl   — DataFrame with fdc_id, name, category, raw nutritional values
"""

import pathlib
import pickle
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ML_DIR = pathlib.Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Load features
# ---------------------------------------------------------------------------
print("Loading food_features.pkl...")
df = pd.read_pickle(ML_DIR / "food_features.pkl")
print(f"  {len(df):,} foods, {len(df.columns)} columns")

# ---------------------------------------------------------------------------
# Split columns
# ---------------------------------------------------------------------------
NUTRIENT_COLS = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg"]
CAT_COLS = [c for c in df.columns if c.startswith("cat_")]
FEATURE_COLS = NUTRIENT_COLS + CAT_COLS

# ---------------------------------------------------------------------------
# Build food index (metadata + raw nutritional values)
# ---------------------------------------------------------------------------
# Recover the human-readable category name from the one-hot columns
cat_matrix = df[CAT_COLS].astype(int)
# argmax gives the column index of the first True; map back to label
cat_labels = cat_matrix.idxmax(axis=1).where(cat_matrix.max(axis=1) == 1, other="Unknown")
cat_labels = cat_labels.str.removeprefix("cat_")

food_index = pd.DataFrame({
    "fdc_id":    df["fdc_id"].values,
    "name":      df["description"].values,
    "category":  cat_labels.values,
    "calories":  df["calories"].values,
    "protein_g": df["protein_g"].values,
    "carbs_g":   df["carbs_g"].values,
    "fat_g":     df["fat_g"].values,
    "fiber_g":   df["fiber_g"].values,
    "sodium_mg": df["sodium_mg"].values,
})

# ---------------------------------------------------------------------------
# Build and normalize feature matrix
# ---------------------------------------------------------------------------
X = df[FEATURE_COLS].astype(float).values

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# ---------------------------------------------------------------------------
# Fit NearestNeighbors
# ---------------------------------------------------------------------------
print("Fitting NearestNeighbors (n_neighbors=20, metric='cosine')...")
model = NearestNeighbors(n_neighbors=20, metric="cosine", algorithm="brute")
model.fit(X_scaled)

# ---------------------------------------------------------------------------
# Save artifacts
# ---------------------------------------------------------------------------
def save_pkl(obj, path: pathlib.Path, label: str) -> None:
    with open(path, "wb") as f:
        pickle.dump(obj, f)
    print(f"  Saved {label}: {path}")

save_pkl(model,      ML_DIR / "recommender.pkl", "recommender")
save_pkl(scaler,     ML_DIR / "scaler.pkl",      "scaler")
save_pkl(food_index, ML_DIR / "food_index.pkl",  "food_index")

print(f"\nDone. food_index shape: {food_index.shape}")
print(food_index.head(3).to_string())
