"use client"
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter as useNextRouter } from 'next/navigation';
import { format, parseISO, addMonths, subMonths, startOfWeek, addWeeks, subWeeks, isSameDay, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LayoutGrid, Rows3, Save } from 'lucide-react';
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView';
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView';
import { SelectedDayMeals } from '@/components/calendar/SelectedDayMeals';
import { MealDetailModal } from '@/components/calendar/MealDetailModal';
import { MealEditModal } from '@/components/calendar/MealEditModal';
import { ChatBox } from '@/components/calendar/ChatBox';
import { eachDayOfInterval } from 'date-fns';
import { Meal, DayMeals, CalendarViewType } from '@/components/calendar/types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** PATCH a single day into its week document (creates the week if needed). */
async function persistDay(day: DayMeals, weekStart: Date) {
  const res = await fetch('/api/meal-plan', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weekStartDate: format(weekStart, 'yyyy-MM-dd'),
      day: {
        date: format(day.date, 'yyyy-MM-dd'),
        status: day.status,
        meals: day.meals,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[persistDay] failed', res.status, err);
  }
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

  const putRes = await fetch('/api/meal-plan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (putRes.status === 404) {
    const postRes = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!postRes.ok) {
      const err = await postRes.json().catch(() => ({}));
      console.error('[persistWeek] POST failed', postRes.status, err);
    }
  } else if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    console.error('[persistWeek] PUT failed', putRes.status, err);
  }
}

function CalendarContent() {
  const searchParams = useSearchParams();
  const calendarRouter = useNextRouter();
  // Consume ?suggest= once — after reading we don't want it to re-apply on
  // every render, so we capture it into a ref on first mount only.
  const initialInput = useRef(searchParams.get('suggest') ?? '').current;
  const onboardingChecked = useRef(false);

  // Onboarding guard — redirect to /onboarding if user has no preferences yet
  useEffect(() => {
    if (onboardingChecked.current) return;
    onboardingChecked.current = true;
    fetch('/api/preferences').then((r) => {
      if (r.status === 404) calendarRouter.replace('/onboarding');
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [viewType, setViewType] = useState<CalendarViewType>('month');
  const [isSaving, setIsSaving] = useState(false);
  // Incrementing this triggers both data-fetch useEffects to re-run after LLM edits
  const [dataVersion, setDataVersion] = useState(0);
  const handleMealPlanChanged = () => setDataVersion((v) => v + 1);

  // ── Empty-state helpers ───────────────────────────────────────────────────
  function emptyMonthDays(year: number, month: number): DayMeals[] {
    const days = eachDayOfInterval({
      start: startOfMonth(new Date(year, month, 1)),
      end: endOfMonth(new Date(year, month, 1)),
    });
    return days.map((date) => ({ date, status: 'none' as const, meals: [] }));
  }

  function emptyWeekDays(weekStart: Date): DayMeals[] {
    return Array.from({ length: 7 }, (_, i) => ({
      date: addDays(weekStart, i),
      status: 'none' as const,
      meals: [],
    }));
  }

  // ── Mutable calendar & week data ──────────────────────────────────────────
  const [calendarData, setCalendarData] = useState<DayMeals[]>(() =>
    emptyMonthDays(new Date().getFullYear(), new Date().getMonth())
  );
  const [weekData, setWeekData] = useState<DayMeals[]>(() =>
    emptyWeekDays(startOfWeek(new Date()))
  );

  // Load month data from DB
  useEffect(() => {
    const emptyBase = emptyMonthDays(currentDate.getFullYear(), currentDate.getMonth());
    setCalendarData(emptyBase);

    // Collect all unique week-start dates visible in this month view
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const weekStarts: string[] = [];
    let cursor = startOfWeek(monthStart);
    while (cursor <= monthEnd) {
      weekStarts.push(format(cursor, 'yyyy-MM-dd'));
      cursor = addDays(cursor, 7);
    }

    Promise.all(
      weekStarts.map((ws) =>
        fetch(`/api/meal-plan?week=${ws}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ).then((results) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const dbDays: DayMeals[] = results.flatMap((plan: any) =>
        plan?.days
          ? plan.days.map((d: any) => ({
              date: parseISO(d.date),
              status: d.status,
              meals: d.meals,
            }))
          : []
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (dbDays.length > 0) {
        setCalendarData((prev) =>
          prev.map((day) => {
            const real = dbDays.find((db) => isSameDay(db.date, day.date));
            return real ?? day;
          })
        );
      }
    });
  }, [currentDate.getFullYear(), currentDate.getMonth(), dataVersion]);

  // Load week from DB
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
          setWeekData(emptyWeekDays(ws));
        }
      })
      .catch(() => setWeekData(emptyWeekDays(startOfWeek(currentDate))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format(startOfWeek(currentDate), 'yyyy-MM-dd'), dataVersion]);

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
    // Determine which date is being modified.
    // For a new meal, use addingToDate. For an edit, find the day that owns the meal.
    const targetDate: Date = addingToDate ?? (() => {
      const owner = [...calendarData, ...weekData].find((d) =>
        d.meals.some((m) => m.id === updated.id)
      );
      return owner?.date ?? selectedDate ?? currentDate;
    })();

    const updateDay = (day: DayMeals): DayMeals => {
      if (!isSameDay(day.date, targetDate)) return day;
      const newMeals = addingToDate
        ? [...day.meals, updated]
        : day.meals.map((m) => (m.id === updated.id ? updated : m));
      const types = new Set(newMeals.map((m) => m.type));
      const status =
        types.has('breakfast') && types.has('lunch') && types.has('dinner')
          ? 'planned'
          : newMeals.length > 0
          ? 'in-progress'
          : 'none';
      return { ...day, meals: newMeals, status };
    };

    const newCalendarData = calendarData.map(updateDay);
    const newWeekData = weekData.map(updateDay);

    setCalendarData(newCalendarData);
    setWeekData(newWeekData);
    setAddingToDate(null);
    setIsEditOpen(false);
    setEditMeal(null);

    // Find the updated day object to send to the API
    const updatedDay =
      newCalendarData.find((d) => isSameDay(d.date, targetDate)) ??
      newWeekData.find((d) => isSameDay(d.date, targetDate));

    if (updatedDay) {
      persistDay(updatedDay, startOfWeek(targetDate));
    }
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

  async function handleSavePlan() {
    setIsSaving(true);
    try {
      await persistWeek(weekData, startOfWeek(currentDate));
    } finally {
      setIsSaving(false);
    }
  }

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
              {viewType === 'week' && (
                <button
                  onClick={handleSavePlan}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Saving…' : 'Save plan'}
                </button>
              )}
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
        <div className={viewType === 'month' ? 'grid grid-cols-1 xl:grid-cols-3 gap-8' : 'flex flex-col gap-8'}>
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

          {viewType === 'month' ? (
            <div className="xl:col-span-1">
              <div className="sticky top-8 flex flex-col gap-6">
                <SelectedDayMeals
                  dayData={selectedDayData}
                  onMealClick={(meal) => { setSelectedMeal(meal); setIsDetailOpen(true); }}
                  onMealEdit={openEdit}
                  onAddMeal={openAddMeal}
                />
                <div className="h-[420px]">
                  <ChatBox onMealPlanChanged={handleMealPlanChanged} initialInput={initialInput} />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[420px]">
              <ChatBox onMealPlanChanged={handleMealPlanChanged} initialInput={initialInput} />
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

export default function Calendar() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CalendarContent />
    </Suspense>
  );
}
