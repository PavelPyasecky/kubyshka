import { local, type SecretRecord } from './local.ts';

const ID = 'family';

export const readVault = async (): Promise<SecretRecord | null> => (await local.secrets.get(ID)) ?? null;

export const saveVault = async (vault: Omit<SecretRecord, 'id'>): Promise<void> => {
  await local.secrets.put({ id: ID, ...vault });
};

export const clearVault = async (): Promise<void> => {
  await local.secrets.delete(ID);
};
