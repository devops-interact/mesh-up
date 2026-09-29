import { getApiBaseUrl } from './apiBase';

export function resolveAssetUrl(url: string): string {
  if (url.startsWith('http')) return url;
  const base = getApiBaseUrl().replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}
