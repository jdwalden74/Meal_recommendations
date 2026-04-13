import { format, isToday, isSameDay } from 'date-fns';
import { DayMeals, Meal } from './types';
import { MealCard } from './MealCard';
import { Plus } from 'lucide-react';

interface CalendarWeekViewProps {
  weekData: DayMeals[];
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  onMealClick: (meal: Meal) => void;
  onMealEdit: (meal: Meal) => void;
  onAddMeal: (date: Date) => void;
}

export function CalendarWeekView({ weekData, selectedDate, onDateSelect, onMealClick, onMealEdit, onAddMeal }: CalendarWeekViewProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned':
        return 'border-emerald-500 dark:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10';
      case 'in-progress':
        return 'border-orange-500 dark:border-orange-600 bg-orange-50/50 dark:bg-orange-900/10';
      case 'none':
        return 'border-red-500 dark:border-red-600 bg-red-50/50 dark:bg-red-900/10';
      default:
        return 'border-slate-200 dark:border-slate-700';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">Planned</span>;
      case 'in-progress':
        return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white">In Progress</span>;
      case 'none':
        return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">No Meals</span>;
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 w-full">
      {weekData.map((dayData) => {
        const { date, status, meals } = dayData;
        const today = isToday(date);
        const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;

        return (
          <div
            key={date.toISOString()}
            className={`
              bg-white dark:bg-slate-800 rounded-2xl border-2 overflow-hidden transition-all flex flex-col h-full
              ${getStatusColor(status)}
              ${isSelected ? 'ring-2 ring-emerald-500 dark:ring-emerald-600 shadow-lg' : 'shadow-sm'}
              ${today ? 'ring-2 ring-blue-400 dark:ring-blue-600' : ''}
            `}
          >
            {/* Day Header */}
            <button
              onClick={() => onDateSelect(date)}
              className="w-full p-4 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                    {format(date, 'EEE')}
                  </p>
                  <p className={`text-2xl font-bold ${today ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                    {format(date, 'd')}
                  </p>
                </div>
                {getStatusBadge(status)}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {meals.length} meal{meals.length !== 1 ? 's' : ''}
              </p>
            </button>

            {/* Meals List */}
            <div className="p-2 space-y-2 flex-grow overflow-y-auto min-h-[200px]">
              {meals.length > 0 ? (
                meals.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    onClick={() => onMealClick(meal)}
                    onEdit={onMealEdit}
                    isCompact={true}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">No meals planned</p>
                </div>
              )}
              <button
                onClick={() => onAddMeal(date)}
                className="w-full flex items-center justify-center gap-1 py-1.5 border border-dashed border-slate-200 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg text-xs font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add meal
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
