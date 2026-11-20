import { contentKeys, type SyncTable } from './sync-tables.ts';

export const sealContent = (table: SyncTable, entity: object): Record<string, unknown> => {
  const source = entity as Record<string, unknown>;
  const content: Record<string, unknown> = {};
  for (const key of contentKeys[table]) content[key] = source[key];
  return content;
};

export const openContent = (table: SyncTable, value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('payload');
  const source = value as Record<string, unknown>;
  const content: Record<string, unknown> = {};
  for (const key of contentKeys[table]) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) throw new Error('payload');
    content[key] = source[key];
  }
  return content;
};
