import { useMemo } from 'react';
import { toDateKey, upcomingDates } from '../utils/format.js';

/** The next `count` days, pre-formatted for the date strip. */
export function useDateStrip(count = 7) {
  return useMemo(() => {
    const todayKey = toDateKey(new Date());

    return upcomingDates(count).map((date) => {
      const key = toDateKey(date);
      return {
        key,
        date: date.getDate(),
        weekday: new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date),
        label: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date),
        isToday: key === todayKey,
      };
    });
  }, [count]);
}
