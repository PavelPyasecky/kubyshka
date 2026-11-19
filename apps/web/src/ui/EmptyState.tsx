export const EmptyState = ({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) => (
  <div className="empty-state">
    <h2>{title}</h2>
    <p>{text}</p>
    <button type="button" className="primary" onClick={onAction}>
      {action}
    </button>
  </div>
);
