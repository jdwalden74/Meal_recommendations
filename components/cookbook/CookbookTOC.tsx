"use client";
import { useState } from "react";
import { Search, Heart, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { Recipe } from "@/lib/interfaces";
import { RecipeCard } from "./RecipeCard";
import { cn } from "@/lib/utils";

interface CookbookTOCProps {
  initialRecipes: Recipe[];
}

export function CookbookTOC({ initialRecipes }: CookbookTOCProps) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Collect all unique tags
  const allTags = Array.from(new Set(recipes.flatMap((r) => r.tags))).sort();

  // Client-side filter (API already filters server-side on initial load; this handles live typing)
  const filtered = recipes.filter((r) => {
    if (favoritesOnly && !r.isFavorite) return false;
    if (activeTag && !r.tags.includes(activeTag)) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function toggleFavorite(id: string, current: boolean) {
    await fetch(`/api/cookbook/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !current }),
    });
    setRecipes((prev) =>
      prev.map((r) => (String(r._id) === id ? { ...r, isFavorite: !current } : r))
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Search + controls */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors",
              favoritesOnly
                ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-500"
                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-red-300"
            )}
          >
            <Heart className="w-3.5 h-3.5" fill={favoritesOnly ? "currentColor" : "none"} />
            Favorites
          </button>

          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors",
                activeTag === tag
                  ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-400 text-emerald-600 dark:text-emerald-400"
                  : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-300"
              )}
            >
              <Tag className="w-3 h-3" />
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Recipe grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">
            {recipes.length === 0 ? "Your cookbook is empty." : "No recipes match your filters."}
          </p>
          {recipes.length === 0 && (
            <Link
              href="/cookbook/new"
              className="flex items-center gap-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-full transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add your first recipe
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((recipe) => (
            <RecipeCard key={String(recipe._id)} recipe={recipe} onToggleFavorite={toggleFavorite} />
          ))}
        </div>
      )}
    </div>
  );
}
