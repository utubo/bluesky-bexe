import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safely } from '../../src/lib/errorStore.svelte';
import { toast } from '../../src/lib/toast.svelte';

// Mock the toast module
vi.mock('../../src/lib/toast.svelte', () => ({
  toast: {
    showError: vi.fn(),
  },
}));

describe('errorStore (safely)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should return the result when the async function succeeds', async () => {
    const fn = async () => 'success-value';
    const result = await safely(fn);

    expect(result).toBe('success-value');
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it('should catch error, show toast with error message, and return undefined when fn fails', async () => {
    const fn = async () => {
      throw new Error('Network failure');
    };
    const result = await safely(fn, 'Default Error');

    expect(result).toBeUndefined();
    expect(toast.showError).toHaveBeenCalledWith('Network failure');
  });

  it('should use default message when error has no message', async () => {
    const fn = async () => {
      throw {}; // Error without message property
    };
    const result = await safely(fn, 'Fallback Error');

    expect(result).toBeUndefined();
    expect(toast.showError).toHaveBeenCalledWith('Fallback Error');
  });
});
