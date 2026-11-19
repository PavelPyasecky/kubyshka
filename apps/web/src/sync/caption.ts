import { plural } from '../ui/plural.ts';

export const syncLine = (
  offline: boolean,
  pending: number,
  lastSyncedAt: number,
  now = Date.now(),
): { title: string; detail: string } => {
  const changes = `${pending} ${plural(pending, 'изменение', 'изменения', 'изменений')}`;

  if (offline) return { title: 'Нет сети', detail: pending === 0 ? 'изменений нет' : `${changes} ${plural(pending, 'ждёт', 'ждут', 'ждут')} отправки` };
  if (pending > 0) return { title: 'Ждут отправки', detail: changes };

  if (lastSyncedAt === 0) return { title: 'Синхронизация', detail: 'ещё не было' };
  return { title: 'Синхронизировано', detail: ago(now - lastSyncedAt) };
};

const ago = (elapsed: number): string => {
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes === 1) return 'минуту назад';
  if (minutes < 60) return `${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'час назад';
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
};
