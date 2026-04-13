export type MealStatus = 'planned' | 'in-progress' | 'none';

export interface NutritionalInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
}

export interface Meal {
  id: string;
  name: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time: string;
  image: string;
  nutrition: NutritionalInfo;
  ingredients?: string[];
}

export interface DayMeals {
  date: Date;
  status: MealStatus;
  meals: Meal[];
}

export type CalendarViewType = 'month' | 'week';
