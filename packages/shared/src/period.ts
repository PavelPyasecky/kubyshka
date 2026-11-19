export type MonthKey = string;

const pad = (value: number): string => String(value).padStart(2, '0');

export const monthKeyOf = (date: Date): MonthKey => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const monthStart = (key: MonthKey): Date => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
};

export const monthEnd = (key: MonthKey): Date => {
  const start = monthStart(key);
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
};

export const daysInMonth = (key: MonthKey): number => monthEnd(key).getDate();

export const shiftMonth = (key: MonthKey, offset: number): MonthKey => {
  const start = monthStart(key);
  return monthKeyOf(new Date(start.getFullYear(), start.getMonth() + offset, 1));
};

export const lastMonths = (key: MonthKey, count: number): MonthKey[] =>
  Array.from({ length: count }, (_, index) => shiftMonth(key, index - count + 1));

export const elapsedDays = (key: MonthKey, now: Date): number => {
  if (monthKeyOf(now) !== key) return daysInMonth(key);
  return now.getDate();
};

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

const MONTH_NAMES_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const MONTH_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const MONTH_PREPOSITIONAL = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];

export const monthName = (key: MonthKey): string => MONTH_NAMES[monthStart(key).getMonth()];

export const formatDay = (key: MonthKey, day: number): string =>
  `${day} ${MONTH_GENITIVE[monthStart(key).getMonth()]}`;

export const monthNameShort = (key: MonthKey): string => MONTH_NAMES_SHORT[monthStart(key).getMonth()];

export const monthNameIn = (key: MonthKey): string => MONTH_PREPOSITIONAL[monthStart(key).getMonth()];
