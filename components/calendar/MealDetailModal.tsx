"use client";

import { useState } from 'react';
import { X, Flame, Apple, Beef, Droplets, Pencil, UtensilsCrossed } from 'lucide-react';
import { Meal } from './types';
import { StarRating } from '@/components/ui/StarRating';

interface MealDetailModalProps {
  meal: Meal | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (meal: Meal) => void;
}

export function MealDetailModal({ meal, isOpen, onClose, onEdit }: MealDetailModalProps) {
  const [rating, setRating] = useState<number | null>(meal?.rating ?? null);

  // Re-sync rating if a different meal is opened
  const currentMealId = meal?.id;
  const [syncedMealId, setSyncedMealId] = useState<string | undefined>(currentMealId);
  if (currentMealId !== syncedMealId) {
    setRating(meal?.rating ?? null);
    setSyncedMealId(currentMealId);
  }

  if (!isOpen || !meal) return null;

  const nutritionItems = [
    { label: 'Calories', value: `${meal.nutrition.calories} kcal`, icon: Flame, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
    { label: 'Protein', value: `${meal.nutrition.protein}g`, icon: Beef, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
    { label: 'Carbs', value: `${meal.nutrition.carbs}g`, icon: Apple, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    { label: 'Fat', value: `${meal.nutrition.fat}g`, icon: Droplets, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  ];

  if (meal.nutrition.fiber) {
    nutritionItems.push({ 
      label: 'Fiber', 
      value: `${meal.nutrition.fiber}g`, 
      icon: Apple, 
      color: 'text-green-600 dark:text-green-400', 
      bg: 'bg-green-100 dark:bg-green-900/30' 
    });
  }

  if (meal.nutrition.sodium) {
    nutritionItems.push({ 
      label: 'Sodium', 
      value: `${meal.nutrition.sodium}mg`, 
      icon: Droplets, 
      color: 'text-purple-600 dark:text-purple-400', 
      bg: 'bg-purple-100 dark:bg-purple-900/30' 
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transition-colors">
          {/* Header with Image */}
          <div className="relative">
            {meal.image ? (
              <img
                src={meal.image}
                alt={meal.name}
                className="w-full h-64 object-cover rounded-t-2xl"
              />
            ) : (
              <div className="w-full h-64 rounded-t-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                <UtensilsCrossed className="w-16 h-16 text-white/20" />
              </div>
            )}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-colors shadow-lg"
            >
              <X className="w-5 h-5 text-slate-700 dark:text-slate-200" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                {meal.type}{meal.time ? ` • ${meal.time}` : ''}
              </span>
              <h2 className="text-2xl font-bold text-white mt-1">{meal.name}</h2>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Nutritional Info Grid */}
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Nutritional Information</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {nutritionItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div 
                      key={index}
                      className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-2 rounded-lg ${item.bg}`}>
                          <Icon className={`w-4 h-4 ${item.color}`} />
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{item.label}</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">{item.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Description + Rating */}
            <div className="space-y-3">
              {meal.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {meal.description}
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Your rating
                </span>
                <StarRating
                  value={rating}
                  onChange={setRating}
                  mealId={meal.id}
                  mealName={meal.name}
                  nutrition={meal.nutrition}
                />
              </div>
            </div>

            {/* Ingredients */}
            {meal.ingredients && meal.ingredients.length > 0 && (
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-3">Ingredients</h3>
                <div className="flex flex-wrap gap-2">
                  {meal.ingredients.map((ingredient, index) => (
                    <span 
                      key={index}
                      className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-sm font-medium"
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Macros Summary */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Total Calories</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {meal.nutrition.calories} kcal
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-600 dark:text-slate-400">Macros</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    P: {meal.nutrition.protein}g • C: {meal.nutrition.carbs}g • F: {meal.nutrition.fat}g
                  </p>
                </div>
              </div>
            </div>

            {/* Edit action */}
            {onEdit && (
              <button
                onClick={() => onEdit(meal)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 rounded-xl font-medium text-sm transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit meal
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
