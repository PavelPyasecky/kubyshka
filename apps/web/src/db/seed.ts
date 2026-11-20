import { defaultAccounts, defaultCategories } from '@kubyshka/shared';
import { local } from './local.ts';
import { persist } from './repo.ts';
import { session } from '../state/session.ts';

export const seedLocalFamily = async (): Promise<void> => {
  if ((await local.families.count()) > 0) return;

  await persist('families', { id: session.familyId, name: 'Семья', savingsNorm: 0, expectedIncome: 0 });

  for (const [index, category] of defaultCategories.entries()) {
    await persist('categories', { ...category, sort: index, archived: false });
  }

  for (const [index, account] of defaultAccounts.entries()) {
    await persist('accounts', {
      ...account,
      scope: 'shared',
      ownerMemberId: null,
      openingBalance: 0,
      creditLimit: null,
      sort: index,
      archived: false,
    });
  }
};
