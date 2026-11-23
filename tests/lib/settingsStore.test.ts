import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub localStorage globally before importing the store
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Import store after stubbing globals
import { settingsStore } from '../../src/lib/settingsStore.svelte';

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should have correct default values', () => {
    expect(settingsStore.enterToSend).toBe(false);
    expect(settingsStore.switchToMentionsOnNew).toBe(true);
    expect(settingsStore.theme).toBe('system');
    expect(settingsStore.accentColor).toBe('#1d9bf0');
    expect(settingsStore.fontSize).toBe(16);
    expect(settingsStore.updateDelayInterval).toBe(45000);
  });

  describe('set and toggle methods', () => {
    it('should update state, persist to localStorage, and apply changes', () => {
      settingsStore.set('enterToSend', true);
      expect(settingsStore.enterToSend).toBe(true);
      expect(localStorage.getItem('compose_enter_to_send')).toBe('true');

      settingsStore.toggle('enterToSend');
      expect(settingsStore.enterToSend).toBe(false);
      expect(localStorage.getItem('compose_enter_to_send')).toBe('false');
    });

    it('should correctly parse and set numeric options', () => {
      settingsStore.set('fontSize', 20);
      expect(settingsStore.fontSize).toBe(20);
      expect(localStorage.getItem('app_font_size')).toBe('20');
    });

    it('should handle theme selection correctly', () => {
      settingsStore.set('theme', 'dark');
      expect(settingsStore.theme).toBe('dark');
      expect(localStorage.getItem('app_theme')).toBe('dark');
    });
  });
});
