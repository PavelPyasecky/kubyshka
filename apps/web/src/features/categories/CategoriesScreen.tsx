import { useState } from 'react';
import type { Category } from '@kubyshka/shared';
import { useCategories, useTransactions } from '../../data/hooks.ts';
import { persist, softDelete } from '../../db/repo.ts';
import { closeOverlay } from '../../app/navigation.ts';
import { IconPicker } from '../../ui/IconPicker.tsx';

const reorder = <T,>(items: T[], from: number, to: number): T[] => {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
};

const CategoryRows = ({ items, onEdit, onReorder }: { items: Category[]; onEdit: (category: Category) => void; onReorder: (items: Category[]) => void }) => {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const shown = drag ? reorder(items, drag.from, drag.over) : items;

  return (
    <div className="list">
      {shown.map((category) => (
        <div className="op" key={category.id}>
          <button type="button" className="op-main" onClick={() => onEdit(category)}>
            <div className="ic" style={{ background: `${category.color}1A` }}>
              {category.icon}
            </div>
            <div className="txt">
              <b>{category.name}</b>
            </div>
          </button>
          <button
            type="button"
            className="handle"
            aria-label={`Перетащить ${category.name}`}
            onPointerDown={(event) => {
              const handle = event.currentTarget;
              handle.setPointerCapture(event.pointerId);
              const origin = event.clientY;
              const from = items.findIndex((item) => item.id === category.id);
              let over = from;

              const move = (ev: PointerEvent) => {
                const next = Math.max(0, Math.min(items.length - 1, from + Math.round((ev.clientY - origin) / 56)));
                if (next === over) return;
                over = next;
                setDrag({ from, over });
              };
              const finish = () => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', finish);
                handle.removeEventListener('pointercancel', finish);
                setDrag(null);
                if (over !== from) onReorder(reorder(items, from, over));
              };

              handle.addEventListener('pointermove', move);
              handle.addEventListener('pointerup', finish);
              handle.addEventListener('pointercancel', finish);
            }}
          >
            ☰
          </button>
        </div>
      ))}
    </div>
  );
};

const CategoryList = ({ onCreate, onEdit }: { onCreate: () => void; onEdit: (category: Category) => void }) => {
  const categories = useCategories();
  const expenses = categories.filter((category) => category.flow === 'expense' && !category.archived);
  const incomes = categories.filter((category) => category.flow === 'income' && !category.archived);
  const archived = categories.filter((category) => category.archived);

  const commit = (nextExpenses: Category[], nextIncomes: Category[]) => {
    const ordered = [...nextExpenses, ...nextIncomes, ...archived];
    void Promise.all(
      ordered.map((category, sort) => (category.sort === sort ? Promise.resolve() : persist('categories', { ...category, sort }))),
    );
  };

  return (
    <div className="screen overlay">
      <div className="scroll">
        <button type="button" className="nav-back" onClick={closeOverlay}>
          ‹ Ещё
        </button>
        <div className="title-row">
          <h1>Категории</h1>
        </div>
        <p className="caption">Архивная категория не предлагается при вводе и остаётся в отчётах. Порядок меняется перетаскиванием.</p>

        <div className="section-head">
          <h2>Расходы</h2>
        </div>
        <CategoryRows items={expenses} onEdit={onEdit} onReorder={(next) => commit(next, incomes)} />

        <div className="section-head">
          <h2>Доходы</h2>
        </div>
        <CategoryRows items={incomes} onEdit={onEdit} onReorder={(next) => commit(expenses, next)} />

        {archived.length > 0 && (
          <>
            <div className="section-head">
              <h2>В архиве</h2>
            </div>
            <div className="list">
              {archived.map((category) => (
                <button type="button" className="op" key={category.id} onClick={() => onEdit(category)}>
                  <div className="ic" style={{ background: `${category.color}1A` }}>
                    {category.icon}
                  </div>
                  <div className="txt">
                    <b>{category.name}</b>
                    <span>{category.flow === 'income' ? 'доход' : 'расход'}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="form">
          <button type="button" className="primary" onClick={onCreate}>
            Новая категория
          </button>
        </div>
      </div>
    </div>
  );
};

const CategoryEditor = ({ category, onClose }: { category?: Category; onClose: () => void }) => {
  const categories = useCategories();
  const transactions = useTransactions();
  const [name, setName] = useState(category?.name ?? '');
  const [flow, setFlow] = useState<Category['flow']>(category?.flow ?? 'expense');
  const [icon, setIcon] = useState(category?.icon ?? '•');
  const [color, setColor] = useState(category?.color ?? '#8E8E93');
  const [error, setError] = useState('');
  const used = category ? transactions.some((item) => item.categoryId === category.id) : false;

  const save = async (archived = category?.archived ?? false) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Введите название категории');
      return;
    }

    await persist('categories', {
      ...(category ?? {}),
      name: trimmed,
      flow,
      icon,
      color,
      sort: category?.sort ?? categories.reduce((min, item) => Math.min(min, item.sort), 0) - 1,
      archived,
    });
    onClose();
  };

  const remove = async () => {
    if (!category || used) return;
    await softDelete('categories', category.id);
    onClose();
  };

  return (
    <div className="screen overlay">
      <div className="scroll">
        <button type="button" className="nav-back" onClick={onClose}>
          ‹ Категории
        </button>
        <div className="title-row">
          <h1>{category ? 'Категория' : 'Новая категория'}</h1>
        </div>

        <div className="form">
          <input placeholder="Название" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="segmented" style={{ marginBottom: 12 }}>
          <button type="button" aria-pressed={flow === 'expense'} onClick={() => setFlow('expense')}>
            Расход
          </button>
          <button type="button" aria-pressed={flow === 'income'} onClick={() => setFlow('income')}>
            Доход
          </button>
        </div>

        <IconPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
        {error && <p className="error">{error}</p>}

        <div className="form">
          <button type="button" className="primary" onClick={() => void save()}>
            Сохранить
          </button>
          {category && (
            <button type="button" className="danger" onClick={() => void save(!category.archived)}>
              {category.archived ? 'Вернуть из архива' : 'В архив'}
            </button>
          )}
          {category && !used && (
            <button type="button" className="danger" onClick={() => void remove()}>
              Удалить категорию
            </button>
          )}
          {category && used && <p className="note">По категории есть операции, её можно только архивировать.</p>}
        </div>
      </div>
    </div>
  );
};

export const CategoriesScreen = () => {
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  if (editing) return <CategoryEditor category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />;
  return <CategoryList onCreate={() => setEditing('new')} onEdit={setEditing} />;
};
