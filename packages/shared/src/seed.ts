export type CategorySeed = { name: string; flow: 'expense' | 'income'; icon: string; color: string };

const GREEN = '#15724C';
const BLUE = '#3478F6';
const AMBER = '#B07400';
const VIOLET = '#7D5BA6';
const RED = '#B23A2E';
const GRAY = '#8E8E93';
const TEAL = '#0F7A7A';
const PINK = '#B3487A';

export const defaultCategories: CategorySeed[] = [
  { name: 'Продукты', flow: 'expense', icon: '🛒', color: GREEN },
  { name: 'Кафе', flow: 'expense', icon: '☕️', color: AMBER },
  { name: 'Транспорт', flow: 'expense', icon: '🚕', color: VIOLET },
  { name: 'Дом', flow: 'expense', icon: '🏠', color: BLUE },
  { name: 'Аптека', flow: 'expense', icon: '💊', color: RED },
  { name: 'Здоровье', flow: 'expense', icon: '🩺', color: TEAL },
  { name: 'Дети', flow: 'expense', icon: '🧸', color: PINK },
  { name: 'Одежда', flow: 'expense', icon: '👕', color: VIOLET },
  { name: 'Красота', flow: 'expense', icon: '💈', color: PINK },
  { name: 'Развлечения', flow: 'expense', icon: '🎬', color: AMBER },
  { name: 'Спорт', flow: 'expense', icon: '🏃', color: TEAL },
  { name: 'Связь', flow: 'expense', icon: '📱', color: BLUE },
  { name: 'Подписки', flow: 'expense', icon: '🔁', color: GRAY },
  { name: 'Подарки', flow: 'expense', icon: '🎁', color: PINK },
  { name: 'Путешествия', flow: 'expense', icon: '✈️', color: BLUE },
  { name: 'Образование', flow: 'expense', icon: '📚', color: TEAL },
  { name: 'Питомцы', flow: 'expense', icon: '🐾', color: AMBER },
  { name: 'Авто', flow: 'expense', icon: '🚗', color: GRAY },
  { name: 'Налоги', flow: 'expense', icon: '🧾', color: RED },
  { name: 'Прочее', flow: 'expense', icon: '•', color: GRAY },
  { name: 'Зарплата', flow: 'income', icon: '💼', color: GREEN },
  { name: 'Премия', flow: 'income', icon: '🏆', color: GREEN },
  { name: 'Подработка', flow: 'income', icon: '🛠', color: TEAL },
  { name: 'Проценты', flow: 'income', icon: '📈', color: BLUE },
  { name: 'Подарок', flow: 'income', icon: '🎀', color: PINK },
];

export type AccountSeed = { name: string; kind: 'cash' | 'debit' | 'savings'; icon: string; color: string };

export const defaultAccounts: AccountSeed[] = [
  { name: 'Наличные', kind: 'cash', icon: '💵', color: GREEN },
  { name: 'Карта', kind: 'debit', icon: '💳', color: BLUE },
  { name: 'Копилка', kind: 'savings', icon: '🐷', color: AMBER },
];
