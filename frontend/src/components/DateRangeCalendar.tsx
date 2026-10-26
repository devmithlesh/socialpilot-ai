import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

const MAX_DAYS = 7;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function countDays(start: Date, end: Date): number {
  return eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) }).length;
}

export function clampRange(start: Date, end: Date, maxDays = MAX_DAYS): { start: Date; end: Date } {
  const from = startOfDay(start);
  let to = startOfDay(end);
  if (isBefore(to, from)) {
    return clampRange(to, from, maxDays);
  }
  const days = eachDayOfInterval({ start: from, end: to });
  if (days.length > maxDays) {
    to = addDays(from, maxDays - 1);
  }
  return { start: from, end: to };
}

interface DateRangeCalendarProps {
  start: Date;
  end: Date;
  onChange: (start: Date, end: Date) => void;
  maxDays?: number;
}

export function DateRangeCalendar({ start, end, onChange, maxDays = MAX_DAYS }: DateRangeCalendarProps) {
  const [month, setMonth] = useState(startOfMonth(start));
  const [pickingEnd, setPickingEnd] = useState(false);

  const days = useMemo(() => {
    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const leading = first.getDay();
    const cells: Array<Date | null> = [
      ...Array.from({ length: leading }, () => null),
      ...eachDayOfInterval({ start: first, end: last }),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const range = clampRange(start, end, maxDays);
  const today = startOfDay(new Date());

  const handlePick = (day: Date) => {
    const picked = startOfDay(day);
    if (isBefore(picked, today)) return;

    if (!pickingEnd) {
      onChange(picked, picked);
      setPickingEnd(true);
      return;
    }

    const next = clampRange(range.start, picked, maxDays);
    onChange(next.start, next.end);
    setPickingEnd(false);
  };

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="btn-icon h-8 w-8"
          onClick={() => setMonth((current) => addMonths(current, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-[var(--color-text)]">
          {format(month, 'MMMM yyyy')}
        </p>
        <button
          type="button"
          className="btn-icon h-8 w-8"
          onClick={() => setMonth((current) => addMonths(current, 1))}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;

          const inMonth = isSameMonth(day, month);
          const past = isBefore(day, today);
          const selectedStart = isSameDay(day, range.start);
          const selectedEnd = isSameDay(day, range.end);
          const inRange = isWithinInterval(day, { start: range.start, end: range.end });

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={past}
              onClick={() => handlePick(day)}
              className={clsx(
                'h-9 rounded-lg text-xs transition-colors',
                !inMonth && 'opacity-40',
                past && 'opacity-30 cursor-not-allowed',
                inRange && !selectedStart && !selectedEnd && 'bg-brand-500/15 text-[var(--color-text)]',
                (selectedStart || selectedEnd) && 'bg-brand-500 text-white font-semibold',
                !inRange && !past && 'hover:bg-[var(--color-surface-2)] text-[var(--color-text)]',
                isToday(day) && !selectedStart && !selectedEnd && 'ring-1 ring-brand-500/40',
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-[var(--color-text-muted)] mt-3">
        Tap a start date, then an end date. Up to {maxDays} days.
      </p>
    </div>
  );
}
