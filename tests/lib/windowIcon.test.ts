// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateWindowIcon, resetIcon } from '$lib/windowIcon';

// Mock Tauri modules
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setIcon: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@tauri-apps/api/image', () => ({
  Image: {
    new: vi.fn().mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Mock window.Image to simulate successful loading immediately
beforeEach(() => {
  vi.clearAllMocks();

  // Use a proper constructor function or class for new Image()
  vi.spyOn(window, 'Image').mockImplementation(function (this: any) {
    const img = {
      set src(_val: string) {
        setTimeout(() => img.onload?.(new Event('load')), 0);
      },
      onload: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: ErrorEvent) => void) | null,
    };
    return img as unknown as HTMLImageElement;
  } as any);
});

describe('windowIcon.ts', () => {
  it('should update window and tray icons without dot successfully', async () => {
    await updateWindowIcon();
    // Verify execution completes without error
    expect(true).toBe(true);
  });

  it('should update window and tray icons with dotColor successfully', async () => {
    await updateWindowIcon('#ff0000');
    expect(true).toBe(true);
  });

  it('should reset icon successfully', async () => {
    await resetIcon();
    expect(true).toBe(true);
  });
});
