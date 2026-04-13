import { Clock, Flame, Pencil, UtensilsCrossed } from 'lucide-react';
import { Meal } from './types';

interface MealCardProps {
  meal: Meal;
  onClick: () => void;
  onEdit?: (meal: Meal) => void;
  isCompact?: boolean;
}

export function MealCard({ meal, onClick, onEdit, isCompact }: MealCardProps) {
  const getMealTypeColor = (type: string) => {
    switch (type) {
      case 'breakfast':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      case 'lunch':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'dinner':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      case 'snack':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer group ${isCompact ? 'p-2' : 'p-3'}`}
    >
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(meal); }}
          className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 bg-white dark:bg-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 border border-slate-200 dark:border-slate-500 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all z-10"
          aria-label="Edit meal"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
      <div className={`flex ${isCompact ? 'flex-col gap-2' : 'flex-row gap-3'}`}>
        {meal.image ? (
          <img
            src={meal.image}
            alt={meal.name}
            className={`${isCompact ? 'w-full h-24' : 'w-16 h-16'} rounded-lg object-cover shrink-0 group-hover:scale-105 transition-transform`}
          />
        ) : (
          <div className={`${isCompact ? 'w-full h-24' : 'w-16 h-16'} rounded-lg bg-slate-100 dark:bg-slate-600 flex items-center justify-center shrink-0`}>
            <UtensilsCrossed className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          </div>
        )}
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${getMealTypeColor(meal.type)}`}>
              {meal.type}
            </span>
          </div>
          <h4 className={`font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors ${isCompact ? 'text-xs line-clamp-2' : 'text-sm truncate'}`}>
            {meal.name}
          </h4>
          <div className={`flex items-center gap-2 mt-1 text-[10px] text-slate-500 dark:text-slate-400 ${isCompact ? 'flex-wrap' : ''}`}>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{meal.time}</span>
            </div>
            <div className="flex items-center gap-1">
              <Flame className="w-3 h-3" />
              <span>{meal.nutrition.calories} kcal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
