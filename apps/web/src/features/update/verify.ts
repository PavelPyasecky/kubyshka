import { parseReleaseManifest, releaseMatches } from '@kubyshka/shared';

const MANIFEST_URL =
  import.meta.env.VITE_RELEASE_MANIFEST_URL || 'https://raw.githubusercontent.com/PavelPyasecky/kubyshka/main/integrity.json';

const UNAVAILABLE =
  'Не удалось сверить новую версию с публикацией на GitHub, поэтому она не включается. Проверьте сеть и откройте приложение позже. Если репозиторий закрытый, выложите integrity.json в публичное место и соберите приложение с его адресом.';

const MISMATCH =
  'Сборка на сервере не совпадает с опубликованной на GitHub, поэтому обновление остановлено. Залейте ту же сборку, для которой обновлён integrity.json, и откройте приложение снова.';

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** Параметр release не входит в список, который Workbox игнорирует, поэтому запрос идёт в сеть, а не в кэш старой версии. */
const fetchPublishedBytes = async (path: string): Promise<ArrayBuffer | null> => {
  const url = new URL(path, location.origin);
  url.searchParams.set('release', String(Date.now()));
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) return null;
  return response.arrayBuffer();
};

export const verifyPublishedBuild = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
  let expected: Record<string, string> | null = null;
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) return { ok: false, message: UNAVAILABLE };
    expected = parseReleaseManifest(await response.json());
  } catch {
    return { ok: false, message: UNAVAILABLE };
  }
  if (!expected) return { ok: false, message: UNAVAILABLE };

  const actual: Record<string, string> = {};
  try {
    for (const path of Object.keys(expected)) {
      const bytes = await fetchPublishedBytes(path);
      if (!bytes) return { ok: false, message: MISMATCH };
      actual[path] = await sha256Hex(bytes);
    }
  } catch {
    return { ok: false, message: UNAVAILABLE };
  }

  return releaseMatches(expected, actual) ? { ok: true } : { ok: false, message: MISMATCH };
};
