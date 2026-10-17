"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Heart, Pencil, UtensilsCrossed, ShoppingCart } from "lucide-react";
import { Recipe } from "@/lib/interfaces";
import { ServingsScaler } from "./ServingsScaler";
import { IngredientList } from "./IngredientList";
import { CookMode } from "./CookMode";
import { ShoppingListPanel } from "./ShoppingListPanel";
import { cn } from "@/lib/utils";

interface RecipeBookProps {
  recipes: Recipe[];
  initialIndex: number;
}

export function RecipeBook({ recipes, initialIndex }: RecipeBookProps) {
  const router = useRouter();
  const [index, setIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0); // -1 = back, 1 = forward
  const [servings, setServings] = useState(recipes[initialIndex]?.servings ?? 4);
  const [cookMode, setCookMode] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(recipes[initialIndex]?.isFavorite ?? false);

  const recipe = recipes[index];
  if (!recipe) return null;

  const scale = servings / recipe.servings;

  function navigate(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= recipes.length) return;
    setDirection(delta);
    setIndex(next);
    setServings(recipes[next].servings);
    setIsFavorite(recipes[next].isFavorite);
    // Update URL without navigation so back button works
    router.replace(`/cookbook/${String(recipes[next]._id)}`, { scroll: false });
  }

  async function toggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    await fetch(`/api/cookbook/${String(recipe._id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: next }),
    });
  }

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <>
      <div className="relative overflow-hidden min-h-screen">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={String(recipe._id)}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) navigate(1);
              else if (info.offset.x > 60) navigate(-1);
            }}
            className="w-full"
          >
            {/* Hero photo */}
            {recipe.photoUrl && (
              <div className="relative w-full aspect-[4/3] bg-slate-100 dark:bg-slate-800">
                <Image src={recipe.photoUrl} alt={recipe.title} fill className="object-cover" priority />
              </div>
            )}

            <div className="px-4 py-5 flex flex-col gap-6 max-w-2xl mx-auto">
              {/* Title + actions */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
                    Recipe {index + 1} of {recipes.length}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{recipe.title}</h1>
                  {recipe.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {recipe.tags.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                  <button onClick={toggleFavorite} className={cn("p-2 rounded-full transition-colors", isFavorite ? "text-red-500 bg-red-50 dark:bg-red-900/30" : "text-slate-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30")}>
                    <Heart className="w-5 h-5" fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                  <button onClick={() => router.push(`/cookbook/${String(recipe._id)}/edit`)} className="p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <Pencil className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Macros bar */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Cal", value: Math.round(recipe.macros.calories * scale) },
                  { label: "Protein", value: `${Math.round(recipe.macros.protein * scale)}g` },
                  { label: "Carbs", value: `${Math.round(recipe.macros.carbs * scale)}g` },
                  { label: "Fat", value: `${Math.round(recipe.macros.fat * scale)}g` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 text-center">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* Servings scaler */}
              <ServingsScaler baseServings={recipe.servings} currentServings={servings} onChange={setServings} />

              {/* Ingredients */}
              <section>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Ingredients</h2>
                <IngredientList ingredients={recipe.ingredients} scale={scale} />
              </section>

              {/* Steps */}
              <section>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Steps</h2>
                <ol className="flex flex-col gap-4">
                  {recipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Notes */}
              {recipe.notes && (
                <section className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-100 dark:border-amber-800/40">
                  <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">Notes</h2>
                  <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{recipe.notes}</p>
                </section>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pb-4">
                <button
                  onClick={() => setCookMode(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  Cook mode
                </button>
                <button
                  onClick={() => setShoppingOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Shopping list
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Page-turn arrows (desktop) */}
        {index > 0 && (
          <button
            onClick={() => navigate(-1)}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-slate-900/80 shadow border border-slate-100 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Previous recipe"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {index < recipes.length - 1 && (
          <button
            onClick={() => navigate(1)}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-slate-900/80 shadow border border-slate-100 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Next recipe"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {cookMode && (
        <CookMode title={recipe.title} steps={recipe.steps} onClose={() => setCookMode(false)} />
      )}
      {shoppingOpen && (
        <ShoppingListPanel
          recipeId={String(recipe._id)}
          recipeTitle={recipe.title}
          onClose={() => setShoppingOpen(false)}
        />
      )}
    </>
  );
}
