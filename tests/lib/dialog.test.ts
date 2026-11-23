// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dialog, confirm, ask, save } from '$lib/dialog.svelte';

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  ask: vi.fn().mockResolvedValue(false),
  save: vi.fn().mockResolvedValue('/path/to/file'),
}));

describe('dialog.svelte.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialog.isOpen = false;
  });

  it('should toggle isOpen state during confirm wrapper execution', async () => {
    expect(dialog.isOpen).toBe(false);

    const promise = confirm('Are you sure?');
    // While executing, isOpen should be true
    expect(dialog.isOpen).toBe(true);

    const result = await promise;
    expect(result).toBe(true);
    expect(dialog.isOpen).toBe(false);
  });

  it('should toggle isOpen state during ask wrapper execution', async () => {
    const result = await ask('Proceed?');
    expect(result).toBe(false);
    expect(dialog.isOpen).toBe(false);
  });

  it('should toggle isOpen state during save wrapper execution', async () => {
    const result = await save({ defaultPath: 'test.png' });
    expect(result).toBe('/path/to/file');
    expect(dialog.isOpen).toBe(false);
  });
});
