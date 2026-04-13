"use client"
import { useState, useEffect } from 'react';
import { format, parseISO, addMonths, subMonths, startOfWeek, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LayoutGrid, Rows3 } from 'lucide-react';
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView';
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView';
import { SelectedDayMeals } from '@/components/calendar/SelectedDayMeals';
import { MealDetailModal } from '@/components/calendar/MealDetailModal';
import { MealEditModal } from '@/components/calendar/MealEditModal';
import { generateMockCalendarData, getWeekData } from '@/components/calendar/mockData';
import { Meal, DayMeals, CalendarViewType } from '@/components/calendar/types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function applyEdit(days: DayMeals[], updated: Meal): DayMeals[] {
  return days.map((day) => ({
    ...day,
    meals: day.meals.map((m) => (m.id === updated.id ? updated : m)),
  }));
}

/** PUT the week's days to the API; fall back to POST if no plan exists yet. */
async function persistWeek(days: DayMeals[], weekStart: Date) {
  const weekStartDate = format(weekStart, 'yyyy-MM-dd');
  const payload = {
    weekStartDate,
    days: days.map((d) => ({
      date: format(d.date, 'yyyy-MM-dd'),
      status: d.status,
      meals: d.meals,
    })),
  };

  const res = await fetch('/api/meal-plan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 404) {
    await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [viewType, setViewType] = useState<CalendarViewType>('month');

  // ── Mutable calendar & week data ──────────────────────────────────────────
  const [calendarData, setCalendarData] = useState<DayMeals[]>(() =>
    generateMockCalendarData(new Date().getFullYear(), new Date().getMonth())
  );
  const [weekData, setWeekData] = useState<DayMeals[]>(() =>
    getWeekData(startOfWeek(new Date()))
  );

  // Regenerate when month changes
  useEffect(() => {
    setCalendarData(generateMockCalendarData(currentDate.getFullYear(), currentDate.getMonth()));
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  // Load week from DB (fall back to mock if no plan saved yet)
  useEffect(() => {
    const ws = startOfWeek(currentDate);
    const weekStr = format(ws, 'yyyy-MM-dd');
    fetch(`/api/meal-plan?week=${weekStr}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.days) {
          setWeekData(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.days.map((d: any) => ({
              date: parseISO(d.date),
              status: d.status,
              meals: d.meals,
            }))
          );
        } else {
          setWeekData(getWeekData(ws));
        }
      })
      .catch(() => setWeekData(getWeekData(startOfWeek(currentDate))));
  }, [format(startOfWeek(currentDate), 'yyyy-MM-dd')]);

  // ── Detail modal ──────────────────────────────────────────────────────────
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // ── Edit / add modal ──────────────────────────────────────────────────────
  const [editMeal, setEditMeal] = useState<Meal | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [addingToDate, setAddingToDate] = useState<Date | null>(null);

  function openEdit(meal: Meal) {
    setIsDetailOpen(false);
    setSelectedMeal(null);
    setAddingToDate(null);
    setEditMeal(meal);
    setIsEditOpen(true);
  }

  function openAddMeal(date: Date) {
    setAddingToDate(date);
    setEditMeal({
      id: crypto.randomUUID(),
      name: '',
      type: 'breakfast',
      time: '',
      image: '',
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ingredients: [],
    });
    setIsEditOpen(true);
  }

  function handleMealSave(updated: Meal) {
    let newWeekData: DayMeals[];

    if (addingToDate) {
      const targetDate = addingToDate;
      const insertIntoDay = (day: DayMeals): DayMeals => {
        if (!isSameDay(day.date, targetDate)) return day;
        const newMeals = [...day.meals, updated];
        const types = new Set(newMeals.map((m) => m.type));
        const status =
          types.has('breakfast') && types.has('lunch') && types.has('dinner')
            ? 'planned'
            : 'in-progress';
        return { ...day, meals: newMeals, status };
      };
      newWeekData = weekData.map(insertIntoDay);
      setCalendarData((prev) => prev.map(insertIntoDay));
      setAddingToDate(null);
    } else {
      newWeekData = applyEdit(weekData, updated);
      setCalendarData((prev) => applyEdit(prev, updated));
    }

    setWeekData(newWeekData);
    setIsEditOpen(false);
    setEditMeal(null);
    persistWeek(newWeekData, startOfWeek(currentDate));
  }

  // ── Selected day ──────────────────────────────────────────────────────────
  const activeData = viewType === 'month' ? calendarData : weekData;
  const selectedDayData = selectedDate
    ? activeData.find((d) => isSameDay(d.date, selectedDate)) ?? null
    : null;

  const handlePrevious = () => {
    if (viewType === 'month') setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };

  const handleNext = () => {
    if (viewType === 'month') setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const getHeaderText = () => {
    if (viewType === 'month') return format(currentDate, 'MMMM yyyy');
    const weekStart = startOfWeek(currentDate);
    return `Week of ${format(weekStart, 'MMM d, yyyy')}`;
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen p-6 md:p-8 transition-colors duration-300">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                Meal Calendar
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Plan and track your daily meals
              </p>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-1 flex gap-1">
                <button
                  onClick={() => setViewType('month')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all ${
                    viewType === 'month'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Month
                </button>
                <button
                  onClick={() => setViewType('week')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all ${
                    viewType === 'week'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Rows3 className="w-4 h-4" />
                  Week
                </button>
              </div>
            </div>
          </div>

          {/* Calendar Controls */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between shadow-sm">
            <button
              onClick={handlePrevious}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="font-bold text-slate-900 dark:text-white text-lg">
                  {getHeaderText()}
                </h2>
              </div>
              <button
                onClick={handleToday}
                className="px-4 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
              >
                Today
              </button>
            </div>

            <button
              onClick={handleNext}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-400">All meals planned</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-slate-600 dark:text-slate-400">In progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-slate-600 dark:text-slate-400">No meals planned</span>
            </div>
          </div>
        </div>

        {/* Calendar Views */}
        <div className={viewType === 'month' ? 'grid grid-cols-1 xl:grid-cols-3 gap-8' : 'w-full'}>
          <div className={viewType === 'month' ? 'xl:col-span-2' : 'w-full'}>
            {viewType === 'month' ? (
              <CalendarMonthView
                currentDate={currentDate}
                calendarData={calendarData}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
              />
            ) : (
              <CalendarWeekView
                weekData={weekData}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                onMealClick={(meal) => { setSelectedMeal(meal); setIsDetailOpen(true); }}
                onMealEdit={openEdit}
                onAddMeal={openAddMeal}
              />
            )}
          </div>

          {viewType === 'month' && (
            <div className="xl:col-span-1">
              <div className="sticky top-8">
                <SelectedDayMeals
                  dayData={selectedDayData}
                  onMealClick={(meal) => { setSelectedMeal(meal); setIsDetailOpen(true); }}
                  onMealEdit={openEdit}
                  onAddMeal={openAddMeal}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <MealDetailModal
        meal={selectedMeal}
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setSelectedMeal(null); }}
        onEdit={openEdit}
      />

      <MealEditModal
        meal={editMeal}
        isOpen={isEditOpen}
        onClose={() => { setIsEditOpen(false); setEditMeal(null); }}
        onSave={handleMealSave}
      />
    </div>
  );
}
