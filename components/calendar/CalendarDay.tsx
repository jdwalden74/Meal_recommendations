import { format, isToday, isSameMonth } from 'date-fns';
import { DayMeals } from './types';

interface CalendarDayProps {
  dayData: DayMeals;
  isSelected: boolean;
  isCurrentMonth: boolean;
  onClick: () => void;
}

export function CalendarDay({ dayData, isSelected, isCurrentMonth, onClick }: CalendarDayProps) {
  const { date, status } = dayData;
  const today = isToday(date);

  const getStatusColor = () => {
    switch (status) {
      case 'planned':
        return 'bg-emerald-500 dark:bg-emerald-600';
      case 'in-progress':
        return 'bg-orange-500 dark:bg-orange-600';
      case 'none':
        return 'bg-red-500 dark:bg-red-600';
      default:
        return 'bg-slate-300 dark:bg-slate-600';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`
        aspect-square p-2 rounded-xl transition-all relative
        ${isCurrentMonth 
          ? 'text-slate-900 dark:text-white' 
          : 'text-slate-400 dark:text-slate-600'
        }
        ${isSelected 
          ? 'bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-500 dark:border-emerald-600 shadow-md' 
          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-sm'
        }
        ${today && !isSelected 
          ? 'ring-2 ring-emerald-400 dark:ring-emerald-600' 
          : ''
        }
      `}
    >
      <div className="h-full flex flex-col items-center justify-between">
        <span className={`text-sm font-bold ${today ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
          {format(date, 'd')}
        </span>
        
        {/* Status Indicator */}
        {isCurrentMonth && (
          <div className="flex items-center justify-center">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          </div>
        )}
      </div>
    </button>
  );
}
