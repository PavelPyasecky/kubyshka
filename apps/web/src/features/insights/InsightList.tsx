import { useEffect, useState } from 'react';
import type { Insight } from '@kubyshka/shared';
import { readMeta, writeMeta } from '../../db/local.ts';

const keyFor = (month: string): string => `dismissedInsights:${month}`;

export const InsightList = ({ insights, month }: { insights: Insight[]; month: string }) => {
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    void readMeta<string[]>(keyFor(month), []).then(setDismissed);
  }, [month]);

  const hide = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    void writeMeta(keyFor(month), next);
  };

  const visible = insights.filter((insight) => !dismissed.includes(insight.id)).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div className="insights">
      {visible.map((insight) => (
        <article key={insight.id} className={`insight ${insight.tone}`}>
          <h3>{insight.title}</h3>
          <p>{insight.body}</p>
          <button type="button" onClick={() => hide(insight.id)} aria-label="Скрыть до конца месяца">
            ×
          </button>
        </article>
      ))}
    </div>
  );
};
