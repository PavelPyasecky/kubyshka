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

export const minorToRaw = (minor: Money): string => {
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  const body = fraction === 0 ? String(whole) : `${whole},${String(fraction).padStart(2, '0')}`;
  return minor < 0 ? `-${body}` : body;
};

export const sharePercent = (part: Money, whole: Money): number => {
  if (part <= 0 || whole <= 0) return 0;
  const percent = Number((BigInt(part) * 100n) / BigInt(whole));
  return percent > 100 ? 100 : percent;
};

export const roundToRubles = (minor: Money): Money => Number(BigInt(minor) / 100n) * 100;
