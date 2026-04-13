import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth } from 'date-fns';
import { CalendarDay } from './CalendarDay';
import { DayMeals } from './types';

interface CalendarMonthViewProps {
  currentDate: Date;
  calendarData: DayMeals[];
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
}

export function CalendarMonthView({ currentDate, calendarData, selectedDate, onDateSelect }: CalendarMonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDayData = (date: Date): DayMeals => {
    const found = calendarData.find(d => isSameDay(d.date, date));
    return found || { date, status: 'none', meals: [] };
  };

  return (
    <div>
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center text-sm font-bold text-slate-600 dark:text-slate-400 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map(day => {
          const dayData = getDayData(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

          return (
            <CalendarDay
              key={day.toISOString()}
              dayData={dayData}
              isSelected={isSelected}
              isCurrentMonth={isCurrentMonth}
              onClick={() => onDateSelect(day)}
            />
          );
        })}
      </div>
    </div>
  );
}
