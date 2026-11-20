import { useRef, useState, type ReactNode } from 'react';

const reorder = <T,>(items: T[], from: number, to: number): T[] => {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
};

type Drag = { from: number; over: number; dy: number; height: number };

const shiftOf = (index: number, drag: Drag | null): number => {
  if (!drag) return 0;
  if (index === drag.from) return drag.dy;
  if (drag.over > drag.from && index > drag.from && index <= drag.over) return -drag.height;
  if (drag.over < drag.from && index < drag.from && index >= drag.over) return drag.height;
  return 0;
};

export const SortableList = <T extends { id: string }>({
  items,
  label,
  onReorder,
  children,
}: {
  items: T[];
  label: (item: T) => string;
  onReorder: (items: T[]) => void;
  children: (item: T) => ReactNode;
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const start = (event: React.PointerEvent<HTMLElement>, index: number) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const list = listRef.current;
    const scroller = list?.closest('.scroll');
    if (!list || !(scroller instanceof HTMLElement)) return;

    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > .op')];
    const tops = rows.map((row) => row.offsetTop);
    const height = rows[index]?.offsetHeight ?? 56;
    const startY = event.clientY;
    const startScroll = scroller.scrollTop;
    let over = index;
    let lastY = startY;
    let lifted = false;
    let active = true;

    const place = (clientY: number) => {
      const dy = clientY - startY + (scroller.scrollTop - startScroll);
      if (!lifted && Math.abs(dy) < 6) return;
      lifted = true;
      const center = tops[index] + height / 2 + dy;
      let next = items.length - 1;
      for (let cursor = 0; cursor < items.length; cursor += 1) {
        if (center < tops[cursor] + (rows[cursor]?.offsetHeight ?? height) / 2) {
          next = cursor;
          break;
        }
      }
      over = next;
      setDrag((current) =>
        current && current.from === index && current.over === over && current.dy === dy && current.height === height
          ? current
          : { from: index, over, dy, height },
      );
    };

    const tick = () => {
      if (!active) return;
      const bounds = scroller.getBoundingClientRect();
      const edge = 64;
      if (lastY < bounds.top + edge) scroller.scrollTop -= Math.ceil((bounds.top + edge - lastY) / 6);
      else if (lastY > bounds.bottom - edge) scroller.scrollTop += Math.ceil((lastY - (bounds.bottom - edge)) / 6);
      place(lastY);
      frame = requestAnimationFrame(tick);
    };

    let frame = requestAnimationFrame(tick);

    const move = (ev: PointerEvent) => {
      lastY = ev.clientY;
      place(lastY);
    };

    const finish = () => {
      active = false;
      cancelAnimationFrame(frame);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      setDrag(null);
      if (lifted && over !== index) onReorder(reorder(items, index, over));
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  };

  return (
    <div className={`list sortable${drag ? ' is-sorting' : ''}`} ref={listRef}>
      {items.map((item, index) => {
        const shift = shiftOf(index, drag);
        const lifted = drag?.from === index;
        return (
          <div
            className={`op${lifted ? ' is-lifted' : ''}`}
            key={item.id}
            style={shift ? { transform: `translateY(${shift}px)` } : undefined}
          >
            {children(item)}
            <div
              className="handle"
              role="button"
              tabIndex={0}
              aria-label={label(item)}
              onPointerDown={(event) => start(event, index)}
            >
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path d="M3.5 6h11M3.5 9h11M3.5 12h11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
};
