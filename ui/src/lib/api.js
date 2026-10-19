// Shared HTTP helpers. Every mutating request carries the CSRF token that
// the server set alongside the session cookie.

export function csrfToken() {
  if (typeof document === 'undefined') return '';
  const cookies = document.cookie.split('; ');
  const secure = location.protocol === 'https:';
  const preferred = secure ? '__Host-lepatch_csrf=' : 'lepatch_csrf=';
  const alternate = secure ? 'lepatch_csrf=' : '__Host-lepatch_csrf=';
  const item = cookies.find(value => value.startsWith(preferred)) || cookies.find(value => value.startsWith(alternate));
  return item ? decodeURIComponent(item.split('=').slice(1).join('=')) : '';
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers, timeout = 12000, ...rest } = options;
  const request = {
    cache: 'no-store',
    credentials: 'same-origin',
    method,
    ...rest,
    signal: options.signal || AbortSignal.timeout(timeout),
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? { 'X-CSRF-Token': csrfToken() } : {}),
      ...(headers || {}),
    },
  };
  if (body !== undefined) request.body = typeof body === 'string' ? body : JSON.stringify(body);
  const response = await fetch(path, request);
  if (response.status === 204) return {};
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }
  if (!response.ok) {
    throw new ApiError(payload.error || `Request failed with status ${response.status}`, response.status);
  }
  return payload;
}

export function query(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}
