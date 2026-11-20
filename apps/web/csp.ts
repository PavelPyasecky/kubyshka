const directives = [
  "default-src 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://raw.githubusercontent.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/** Мета-тег не принимает frame-ancestors, его добавляет только Caddy. */
export const csp = directives.join('; ');

export const cspHeader = `${csp}; frame-ancestors 'none'`;
