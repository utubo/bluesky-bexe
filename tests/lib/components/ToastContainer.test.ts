// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest'; // 追加
import ToastContainer from '$lib/components/ToastContainer.svelte';
import { toast } from '$lib/toast.svelte';

// Mock the toast store
vi.mock('$lib/toast.svelte', () => ({
  toast: {
    messages: [],
    clear: vi.fn(),
  },
}));

describe('ToastContainer.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.messages = [];
  });

  it('should render toast messages correctly', () => {
    toast.messages = [
      { id: '1', message: 'Success message', type: 'success' },
      { id: '2', message: 'Error message', type: 'error' },
    ];

    const { getByText, container } = render(ToastContainer);

    expect(getByText('Success message')).toBeInTheDocument();
    expect(getByText('Error message')).toBeInTheDocument();

    const toastItems = container.querySelectorAll('.toast-item');
    expect(toastItems[0]).toHaveClass('success');
    expect(toastItems[1]).toHaveClass('error');
  });

  it('should call toast.clear when pointer enters the container', async () => {
    toast.messages = [{ id: '1', message: 'Hover test', type: 'info' }];

    const { container } = render(ToastContainer);
    const toastContainerEl = container.querySelector('.toast-container');

    expect(toastContainerEl).not.toBeNull();
    if (toastContainerEl) {
      await fireEvent.pointerEnter(toastContainerEl);
      expect(toast.clear).toHaveBeenCalledTimes(1);
    }
  });
});
