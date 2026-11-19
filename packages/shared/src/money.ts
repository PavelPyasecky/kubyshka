const MINOR_UNITS = 100;

export type Money = number;

export const toMinor = (rubles: number): Money => Math.round(rubles * MINOR_UNITS);

export const toMajor = (minor: Money): number => minor / MINOR_UNITS;

const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const preciseFormatter = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMoney = (minor: Money): string => {
  const major = toMajor(Math.abs(minor));
  const body = Number.isInteger(major) ? formatter.format(major) : preciseFormatter.format(major);
  return `${minor < 0 ? '−' : ''}${body} ₽`;
};

export const formatSigned = (minor: Money): string =>
  minor > 0 ? `+${formatMoney(minor)}` : formatMoney(minor);

export const parseAmount = (input: string): Money => {
  const normalized = input.replace(/\s/g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? toMinor(value) : 0;
};
