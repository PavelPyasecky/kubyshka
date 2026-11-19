import { useRegisterSW } from 'virtual:pwa-register/react';

export const UpdateBanner = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-banner">
      <span>Доступна новая версия</span>
      <button
        type="button"
        onClick={() => {
          void updateServiceWorker(true);
          window.setTimeout(() => window.location.reload(), 400);
        }}
      >
        Обновить
      </button>
    </div>
  );
};
