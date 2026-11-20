export type ReleaseManifest = {
  version: 1;
  algo: 'sha256';
  files: Record<string, string>;
};

const HASH = /^[a-f0-9]{64}$/;

export const parseReleaseManifest = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as { version?: unknown; algo?: unknown; files?: unknown };
  if (body.version !== 1 || body.algo !== 'sha256' || !body.files || typeof body.files !== 'object' || Array.isArray(body.files)) {
    return null;
  }
  const files = body.files as Record<string, unknown>;
  const entries = Object.entries(files);
  if (entries.length === 0) return null;
  for (const [path, hash] of entries) {
    if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('://')) return null;
    if (typeof hash !== 'string' || !HASH.test(hash)) return null;
  }
  if (typeof files['index.html'] !== 'string' || typeof files['sw.js'] !== 'string') return null;
  return Object.fromEntries(entries.map(([path, hash]) => [path, hash as string]));
};

export const releaseMatches = (expected: Record<string, string>, actual: Record<string, string>): boolean =>
  Object.keys(expected).length > 0 && Object.entries(expected).every(([path, hash]) => actual[path] === hash);
