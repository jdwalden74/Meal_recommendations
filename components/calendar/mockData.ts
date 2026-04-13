import { DayMeals, Meal } from './types';
import { startOfMonth, endOfMonth, eachDayOfInterval, addDays, subDays } from 'date-fns';

// Sample meals data
const sampleMeals: Record<string, Meal[]> = {
  breakfast: [
    {
      id: 'b1',
      name: 'Berry Superfood Smoothie',
      type: 'breakfast',
      time: '8:00 AM',
      image: 'https://images.unsplash.com/photo-1638176311291-36b0eacc6b08?w=400',
      nutrition: {
        calories: 350,
        protein: 15,
        carbs: 45,
        fat: 8,
        fiber: 6,
        sodium: 120
      },
      ingredients: ['Blueberries', 'Banana', 'Protein powder', 'Almond milk', 'Chia seeds']
    },
    {
      id: 'b2',
      name: 'Avocado Toast with Eggs',
      type: 'breakfast',
      time: '8:30 AM',
      image: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=400',
      nutrition: {
        calories: 420,
        protein: 18,
        carbs: 35,
        fat: 22,
        fiber: 8,
        sodium: 380
      },
      ingredients: ['Whole grain bread', 'Avocado', 'Eggs', 'Cherry tomatoes', 'Microgreens']
    },
    {
      id: 'b3',
      name: 'Greek Yogurt Parfait',
      type: 'breakfast',
      time: '7:30 AM',
      image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400',
      nutrition: {
        calories: 320,
        protein: 20,
        carbs: 42,
        fat: 6,
        fiber: 5,
        sodium: 85
      },
      ingredients: ['Greek yogurt', 'Granola', 'Mixed berries', 'Honey', 'Almonds']
    }
  ],
  lunch: [
    {
      id: 'l1',
      name: 'Quinoa & Avocado Salad',
      type: 'lunch',
      time: '1:00 PM',
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
      nutrition: {
        calories: 550,
        protein: 20,
        carbs: 60,
        fat: 22,
        fiber: 12,
        sodium: 420
      },
      ingredients: ['Quinoa', 'Avocado', 'Cherry tomatoes', 'Cucumber', 'Lemon dressing']
    },
    {
      id: 'l2',
      name: 'Mediterranean Chicken Bowl',
      type: 'lunch',
      time: '12:30 PM',
      image: 'https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=400',
      nutrition: {
        calories: 620,
        protein: 42,
        carbs: 48,
        fat: 25,
        fiber: 8,
        sodium: 680
      },
      ingredients: ['Grilled chicken', 'Hummus', 'Falafel', 'Mixed greens', 'Tahini sauce']
    },
    {
      id: 'l3',
      name: 'Salmon Poke Bowl',
      type: 'lunch',
      time: '1:15 PM',
      image: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400',
      nutrition: {
        calories: 580,
        protein: 35,
        carbs: 52,
        fat: 20,
        fiber: 7,
        sodium: 520
      },
      ingredients: ['Fresh salmon', 'Sushi rice', 'Edamame', 'Seaweed', 'Sesame seeds']
    }
  ],
  dinner: [
    {
      id: 'd1',
      name: 'Grilled Lemon Herb Chicken',
      type: 'dinner',
      time: '7:00 PM',
      image: 'https://images.unsplash.com/photo-1564636242997-77953084df48?w=400',
      nutrition: {
        calories: 650,
        protein: 45,
        carbs: 10,
        fat: 28,
        fiber: 3,
        sodium: 580
      },
      ingredients: ['Chicken breast', 'Lemon', 'Herbs', 'Olive oil', 'Garlic']
    },
    {
      id: 'd2',
      name: 'Teriyaki Salmon with Vegetables',
      type: 'dinner',
      time: '7:30 PM',
      image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400',
      nutrition: {
        calories: 580,
        protein: 38,
        carbs: 42,
        fat: 24,
        fiber: 6,
        sodium: 720
      },
      ingredients: ['Salmon fillet', 'Teriyaki sauce', 'Broccoli', 'Bell peppers', 'Brown rice']
    },
    {
      id: 'd3',
      name: 'Vegetarian Stir-Fry',
      type: 'dinner',
      time: '6:45 PM',
      image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400',
      nutrition: {
        calories: 480,
        protein: 18,
        carbs: 68,
        fat: 14,
        fiber: 10,
        sodium: 540
      },
      ingredients: ['Tofu', 'Mixed vegetables', 'Soy sauce', 'Ginger', 'Rice noodles']
    }
  ],
  snack: [
    {
      id: 's1',
      name: 'Protein Energy Balls',
      type: 'snack',
      time: '3:30 PM',
      image: 'https://images.unsplash.com/photo-1606312619070-d48b4cda8fb0?w=400',
      nutrition: {
        calories: 180,
        protein: 8,
        carbs: 22,
        fat: 6,
        fiber: 4,
        sodium: 45
      },
      ingredients: ['Dates', 'Almonds', 'Protein powder', 'Coconut flakes', 'Dark chocolate']
    }
  ]
};

// Generate mock calendar data
export function generateMockCalendarData(year: number, month: number): DayMeals[] {
  const firstDay = startOfMonth(new Date(year, month, 1));
  const lastDay = endOfMonth(new Date(year, month, 1));
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });

  return days.map((date, index) => {
    const dayOfMonth = date.getDate();
    
    // Use date as seed for consistent status - this ensures the status is always the same for a given date
    const dateSeed = date.getDate() + date.getMonth() * 31 + date.getFullYear() * 365;
    const statusRandom = (dateSeed % 10) / 10; // Creates a pseudo-random number between 0 and 1
    
    let status: 'planned' | 'in-progress' | 'none';
    let meals: Meal[] = [];

    if (statusRandom < 0.6) {
      // 60% planned
      status = 'planned';
      meals = [
        sampleMeals.breakfast[dateSeed % 3],
        sampleMeals.lunch[dateSeed % 3],
        sampleMeals.dinner[dateSeed % 3],
      ];
    } else if (statusRandom < 0.85) {
      // 25% in progress
      status = 'in-progress';
      meals = [
        sampleMeals.breakfast[dateSeed % 3],
        sampleMeals.lunch[dateSeed % 3],
      ];
      // Add snack sometimes
      if (dateSeed % 5 === 0) {
        meals.push(sampleMeals.snack[0]);
      }
    } else {
      // 15% none
      status = 'none';
      meals = [];
    }

    return {
      date,
      status,
      meals,
    };
  });
}

// Get week data
export function getWeekData(startDate: Date): DayMeals[] {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i);
    
    // Use date as seed for consistent status
    const dateSeed = date.getDate() + date.getMonth() * 31 + date.getFullYear() * 365;
    const statusRandom = (dateSeed % 10) / 10;
    
    let status: 'planned' | 'in-progress' | 'none';
    let meals: Meal[] = [];

    if (statusRandom < 0.6) {
      status = 'planned';
      meals = [
        sampleMeals.breakfast[dateSeed % 3],
        sampleMeals.lunch[dateSeed % 3],
        sampleMeals.dinner[dateSeed % 3],
      ];
    } else if (statusRandom < 0.85) {
      status = 'in-progress';
      meals = [
        sampleMeals.breakfast[dateSeed % 3],
        sampleMeals.lunch[dateSeed % 3],
      ];
    } else {
      status = 'none';
      meals = [];
    }

    days.push({
      date,
      status,
      meals,
    });
  }
  return days;
}