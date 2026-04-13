import { format } from 'date-fns';
import { DayMeals, Meal } from './types';
import { MealCard } from './MealCard';
import { Calendar, Plus } from 'lucide-react';

interface SelectedDayMealsProps {
  dayData: DayMeals | null;
  onMealClick: (meal: Meal) => void;
  onMealEdit: (meal: Meal) => void;
  onAddMeal: (date: Date) => void;
}

export function SelectedDayMeals({ dayData, onMealClick, onMealEdit, onAddMeal }: SelectedDayMealsProps) {
  if (!dayData) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center transition-colors">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-full">
            <Calendar className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-2">Select a Date</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Click on a date in the calendar to view your meals
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { date, status, meals } = dayData;

  const getStatusInfo = () => {
    switch (status) {
      case 'planned':
        return {
          label: 'All Meals Planned',
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        };
      case 'in-progress':
        return {
          label: 'In Progress',
          color: 'text-orange-600 dark:text-orange-400',
          bg: 'bg-orange-100 dark:bg-orange-900/30',
        };
      case 'none':
        return {
          label: 'No Meals Planned',
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-100 dark:bg-red-900/30',
        };
      default:
        return {
          label: 'Unknown',
          color: 'text-slate-600 dark:text-slate-400',
          bg: 'bg-slate-100 dark:bg-slate-700',
        };
    }
  };

  const statusInfo = getStatusInfo();
  const totalCalories = meals.reduce((sum, meal) => sum + meal.nutrition.calories, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + meal.nutrition.protein, 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + meal.nutrition.carbs, 0);
  const totalFat = meals.reduce((sum, meal) => sum + meal.nutrition.fat, 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-700 dark:to-emerald-600 p-6 text-white">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-2xl font-bold">{format(date, 'EEEE, MMMM d')}</h3>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusInfo.bg} ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
        <p className="text-emerald-100">
          {meals.length} meal{meals.length !== 1 ? 's' : ''} • {totalCalories} total calories
        </p>
      </div>

      {/* Summary Stats */}
      {meals.length > 0 && (
        <div className="grid grid-cols-4 gap-4 p-6 bg-slate-50 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCalories}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Calories</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalProtein}g</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Protein</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCarbs}g</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Carbs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalFat}g</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Fat</p>
          </div>
        </div>
      )}

      {/* Meals List */}
      <div className="p-6">
        {meals.length > 0 ? (
          <div className="space-y-3">
            {meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onClick={() => onMealClick(meal)}
                onEdit={onMealEdit}
              />
            ))}
            <button
              onClick={() => onAddMeal(date)}
              className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add meal
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400 mb-3">No meals planned for this day</p>
            <button
              onClick={() => onAddMeal(date)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add meal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
