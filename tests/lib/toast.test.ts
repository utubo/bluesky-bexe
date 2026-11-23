// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from '$lib/toast.svelte';

describe('toast.svelte.ts', () => {
  beforeEach(() => {
    toast.clear();
    vi.useRealTimers();
  });

  it('should add a toast message correctly', () => {
    toast.show('Hello Toast', 'success', 0); // duration = 0 to prevent auto-removal in this test

    expect(toast.messages).toHaveLength(1);
    expect(toast.messages[0].message).toBe('Hello Toast');
    expect(toast.messages[0].type).toBe('success');
  });

  it('should add an error toast correctly using showError', () => {
    toast.showError('Error occurred', 0);

    expect(toast.messages).toHaveLength(1);
    expect(toast.messages[0].message).toBe('Error occurred');
    expect(toast.messages[0].type).toBe('error');
  });

  it('should remove a toast by id', () => {
    toast.show('Test', 'info', 0);
    const id = toast.messages[0].id;

    toast.remove(id);
    expect(toast.messages).toHaveLength(0);
  });

  it('should clear all toasts', () => {
    toast.show('Toast 1', 'info', 0);
    toast.show('Toast 2', 'error', 0);

    expect(toast.messages).toHaveLength(2);

    toast.clear();
    expect(toast.messages).toHaveLength(0);
  });

  it('should automatically remove a toast after duration', () => {
    vi.useFakeTimers();

    toast.show('Auto close', 'info', 3000);
    expect(toast.messages).toHaveLength(1);

    // Fast-forward time
    vi.advanceTimersByTime(3000);

    expect(toast.messages).toHaveLength(0);
  });
});
