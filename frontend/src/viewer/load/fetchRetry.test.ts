import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { isTransientModelFetchError } from './loadMeshScene';

describe('isTransientModelFetchError', () => {
  it('retries network and 5xx failures', () => {
    const network = new axios.AxiosError('Network Error');
    const gateway = new axios.AxiosError('bad gateway');
    gateway.response = { status: 502, data: null, statusText: 'Bad Gateway', headers: {}, config: {} as never };
    expect(isTransientModelFetchError(network)).toBe(true);
    expect(isTransientModelFetchError(gateway)).toBe(true);
  });

  it('does not retry client errors or aborts', () => {
    const missing = new axios.AxiosError('missing');
    missing.response = { status: 404, data: null, statusText: 'Not Found', headers: {}, config: {} as never };
    const canceled = new axios.CanceledError('canceled');
    expect(isTransientModelFetchError(missing)).toBe(false);
    expect(isTransientModelFetchError(canceled)).toBe(false);
    expect(isTransientModelFetchError(new DOMException('Aborted', 'AbortError'))).toBe(false);
  });
});