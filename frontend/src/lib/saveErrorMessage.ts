import axios from 'axios';

export function saveErrorMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return 'Could not save. Try again.';
  }
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (!err.response) return 'Could not reach the server. Try again.';
  return `Could not save (${err.response.status}). Try again.`;
}
