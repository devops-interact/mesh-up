import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { saveErrorMessage } from './saveErrorMessage';

describe('saveErrorMessage', () => {
  it('uses the API detail string', () => {
    const err = new axios.AxiosError('nope');
    err.response = { status: 400, data: { detail: 'Name is required' }, statusText: 'Bad Request', headers: {}, config: {} as never };
    expect(saveErrorMessage(err)).toBe('Name is required');
  });

  it('reports an unreachable server', () => {
    const err = new axios.AxiosError('Network Error');
    expect(saveErrorMessage(err)).toBe('Could not reach the server. Try again.');
  });
});
