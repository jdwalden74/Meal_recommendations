import Link from "next/link";
import Image from "next/image";
import { Heart, Clock } from "lucide-react";
import { Recipe } from "@/lib/interfaces";
import { cn } from "@/lib/utils";

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavorite?: (id: string, current: boolean) => void;
}

function formatDate(d: Date | string | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function RecipeCard({ recipe, onToggleFavorite }: RecipeCardProps) {
  const id = String(recipe._id);

  return (
    <div className="relative group rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow">
      {/* Photo */}
      <Link href={`/cookbook/${id}`}>
        <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-800">
          {recipe.photoUrl ? (
            <Image src={recipe.photoUrl} alt={recipe.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600 text-4xl select-none">
              🍽️
            </div>
          )}
        </div>
      </Link>

      {/* Favorite button */}
      <button
        onClick={(e) => { e.preventDefault(); onToggleFavorite?.(id, recipe.isFavorite); }}
        className={cn(
          "absolute top-2 right-2 p-1.5 rounded-full transition-colors",
          "bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm",
          recipe.isFavorite ? "text-red-500" : "text-slate-400 hover:text-red-400"
        )}
        aria-label={recipe.isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Heart className="w-4 h-4" fill={recipe.isFavorite ? "currentColor" : "none"} />
      </button>

      {/* Details */}
      <Link href={`/cookbook/${id}`} className="block p-3">
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug line-clamp-2">{recipe.title}</h3>

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {recipe.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                {tag}
              </span>
            ))}
          </div>
        )}

        {recipe.lastCooked && (
          <div className="flex items-center gap-1 mt-2 text-xs text-slate-400 dark:text-slate-500">
            <Clock className="w-3 h-3" />
            Last cooked {formatDate(recipe.lastCooked)}
          </div>
        )}
      </Link>
    </div>
  );
}
