import { formatDay, monthKeyOf } from '@kubyshka/shared';

const startOfDay = (time: number): number => {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

export const dayOffset = (time: number, now = Date.now()): number =>
  Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000);

export const dateLabel = (time: number, now = Date.now()): string => {
  const offset = dayOffset(time, now);
  if (offset === 0) return 'сегодня';
  if (offset === 1) return 'вчера';
  const date = new Date(time);
  return formatDay(monthKeyOf(date), date.getDate());
};

export const shiftCalendarDay = (time: number, days: number): number => {
  const date = new Date(time);
  date.setDate(date.getDate() + days);
  return date.getTime();
};

export const atNoon = (isoDate: string): number => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0).getTime();
};

export const isoDate = (time: number): string => {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const clockLabel = (time: number): string => {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${formatDay(monthKeyOf(date), date.getDate())}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
