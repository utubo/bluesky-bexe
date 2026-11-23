import { invoke } from '@tauri-apps/api/core';

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_UPDATE_DALY_INTERVAL = 45000;
const DEFAULT_EXPANDED_COUNT = 0;
const DEFAULT_PARTIAL_COUNT = 4;
export const DEFAULT_IMAGE_FILENAME_FORMAT = '{displayName}_{date}_{time}_{index}_{snippet}';

export interface ToolbarLeftItemConfig {
  id: string;
  icon?: string;
}

export const DEFAULT_LEFT_ITEMS: ToolbarLeftItemConfig[] = [
  { id: 'timeline' },
  { id: 'mentions' },
  { id: 'likes' },
  { id: 'notifications' },
  { id: 'bookmarks' },
  { id: 'feeds' },
];

interface SettingConfig {
  storageKey: string;
  parse?: (v: string) => any;
  serialize?: (val: any) => string;
  apply?: (store: SettingsStore, val?: any) => void;
}

type SettingKey = {
  [K in keyof SettingsStore]: SettingsStore[K] extends Function ? never : K;
}[keyof SettingsStore];

class SettingsStore {
  // 1. Setting properties (Svelte 5 Runes)
  enterToSend = $state(false);
  switchToMentionsOnNew = $state(true);
  theme = $state<string>('system');
  accentColor = $state('#1d9bf0');
  fontSize = $state<number>(DEFAULT_FONT_SIZE);
  customCss = $state('');
  updateDelayInterval = $state<number>(DEFAULT_UPDATE_DALY_INTERVAL);
  autoScrollOnBlur = $state(true);
  autoHideHeaderOnBlur = $state(false);
  alwaysShowRichContent = $state(true);
  showMediaToggleInToolbar = $state(true);
  expandedCount = $state<number>(DEFAULT_EXPANDED_COUNT);
  partialCount = $state<number>(DEFAULT_PARTIAL_COUNT);
  imageFileNameFormat = $state<string>(DEFAULT_IMAGE_FILENAME_FORMAT);
  shortcutActivate = $state<string>('');
  showTray = $state(false);
  hideUnfollowedReplies = $state(false);
  useOldRepostFormat = $state(false);
  preventMissingMentions = $state(false);
  enableProcessMentions = $state(false);
  toolbarOpacity = $state(0);
  toolbarLeftItems = $state<ToolbarLeftItemConfig[]>([...DEFAULT_LEFT_ITEMS]);

  private cssUpdateTimer: any = null;

  // 2. Configuration map centralizing localStorage keys, parsers, serializers, and DOM applicators
  private configMap: Record<SettingKey, SettingConfig> = {
    enterToSend: { storageKey: 'compose_enter_to_send' },
    switchToMentionsOnNew: { storageKey: 'app_switch_to_mentions_on_new' },
    theme: {
      storageKey: 'app_theme',
      parse: (v) => (v ? v : undefined),
      apply: (store) => store.applyTheme(),
    },
    accentColor: {
      storageKey: 'app_accent_color',
      apply: (store) => store.applyAccentColor(),
    },
    fontSize: {
      storageKey: 'app_font_size',
      parse: (v) => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n > 0 ? n : undefined;
      },
      apply: (store) => store.applyFontSize(),
    },
    toolbarOpacity: {
      storageKey: 'app_toolbar_opacity',
      parse: (v) => {
        const n = parseFloat(v);
        return !isNaN(n) && n >= 0 ? n : undefined;
      },
      apply: (store) => store.applyToolbarOpacity(),
    },
    customCss: {
      storageKey: 'app_custom_css',
      apply: (store) => store.applyCustomCss(),
    },
    updateDelayInterval: {
      storageKey: 'app_update_delay_interval',
      parse: (v) => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n >= 0 ? n : undefined;
      },
    },
    autoScrollOnBlur: { storageKey: 'app_auto_scroll_on_blur' },
    autoHideHeaderOnBlur: { storageKey: 'app_auto_hide_header_on_blur' },
    alwaysShowRichContent: { storageKey: 'app_always_show_rich_content' },
    hideUnfollowedReplies: { storageKey: 'app_hide_unfollowed_replies' },
    useOldRepostFormat: { storageKey: 'app_use_old_repost_format' },
    showMediaToggleInToolbar: { storageKey: 'app_show_media_toggle_in_toolbar' },
    expandedCount: {
      storageKey: 'app_expanded_count',
      parse: (v) => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n >= 0 ? n : undefined;
      },
    },
    partialCount: {
      storageKey: 'app_partial_count',
      parse: (v) => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n >= 0 ? n : undefined;
      },
    },
    imageFileNameFormat: {
      storageKey: 'app_image_filename_format',
      parse: (v) => (v ? v : DEFAULT_IMAGE_FILENAME_FORMAT),
    },
    shortcutActivate: {
      storageKey: 'app_shortcut_activate',
      apply: (store) => {
        store.applyGlobalShortcut();
      },
    },
    showTray: {
      storageKey: 'app_show_tray',
      apply: (store) => {
        store.applyShowTray();
      },
    },
    preventMissingMentions: { storageKey: 'app_prevent_missing_mentions' },
    enableProcessMentions: { storageKey: 'app_enable_process_mentions' },
    toolbarLeftItems: {
      storageKey: 'app_toolbar_left_items',
      parse: (v) => {
        try {
          const parsed = JSON.parse(v);
          if (!Array.isArray(parsed)) return undefined;
          const valid = parsed.filter(
            (item): item is ToolbarLeftItemConfig =>
              Boolean(item) && typeof item.id === 'string' && item.id.length > 0
          );
          return valid.length > 0 ? valid : [...DEFAULT_LEFT_ITEMS];
        } catch {
          return undefined;
        }
      },
      serialize: (val) => JSON.stringify(val),
    },
  };

  constructor() {
    this.restoreSettings();
    this.applyAllSettings();
  }

  // ==========================================
  // Restore & Save Helpers
  // ==========================================

  private restoreSettings() {
    for (const key of Object.keys(this.configMap) as SettingKey[]) {
      const config = this.configMap[key];
      const saved = localStorage.getItem(config.storageKey);
      if (saved === null) continue;

      if (saved === 'true' || saved === 'false') {
        (this as any)[key] = saved === 'true';
        continue;
      }

      if (config.parse) {
        const parsed = config.parse(saved);
        if (parsed !== undefined) {
          (this as any)[key] = parsed;
        }
        continue;
      }

      (this as any)[key] = saved;
    }
  }

  private applyAllSettings() {
    this.applyTheme();
    this.applyAccentColor();
    this.applyCustomCss();
    this.applyFontSize();
    this.applyToolbarOpacity();
    this.applyGlobalShortcut();
    this.applyShowTray();
  }

  // ==========================================
  // Setters & Actions (Generic & Backward Compatible)
  // ==========================================

  private persist(storageKey: string, value: any) {
    const config = Object.values(this.configMap).find((c) => c.storageKey === storageKey);
    const serialized = config?.serialize ? config.serialize(value) : String(value);
    localStorage.setItem(storageKey, serialized);
  }

  // Generic toggle method
  toggle(key: SettingKey) {
    if (typeof this[key] === 'boolean') {
      const newVal = !this[key];
      this.set(key, newVal);
    }
  }

  // Generic set method (automatically handles persistence and DOM application)
  set(key: SettingKey, value: any) {
    const config = this.configMap[key];
    let finalVal = value;

    if (config?.parse && typeof value === 'string') {
      finalVal = config.parse(value) ?? value;
    }

    (this as any)[key] = finalVal;

    if (config) {
      this.persist(config.storageKey, finalVal);
      config.apply?.(this, finalVal);
    }
  }

  // CSS-specific setter with debounced saving
  setCustomCss(css: string, immediate = false) {
    this.customCss = css;

    if (this.cssUpdateTimer) {
      clearTimeout(this.cssUpdateTimer);
    }

    if (immediate) {
      this.saveAndApplyCss();
    } else {
      this.cssUpdateTimer = setTimeout(() => {
        this.saveAndApplyCss();
      }, 500);
    }
  }

  private saveAndApplyCss() {
    this.persist(this.configMap.customCss.storageKey, this.customCss);
    this.applyCustomCss();
  }

  saveToolbarLeftItems() {
    this.persist(this.configMap.toolbarLeftItems.storageKey, this.toolbarLeftItems);
  }

  // ==========================================
  // DOM Apply Helpers
  // ==========================================

  private applyTheme() {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const themes = [];
    for (const cls of root.classList) {
      if (cls.startsWith('theme-')) {
        themes.push(cls);
      }
    }
    root.classList.remove(...themes);

    if (this.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('theme-dark');
      } else {
        root.classList.add('theme-light');
      }
    } else {
      root.classList.add('theme-' + this.theme);
    }
  }

  private applyAccentColor() {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--accent-color', this.accentColor);
  }

  private applyFontSize() {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--font-size', `${this.fontSize}px`);
  }

  private applyToolbarOpacity() {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--toolbar-opacity', `${this.toolbarOpacity}`);
  }

  private applyCustomCss() {
    if (typeof document === 'undefined') return;

    let styleEl = document.getElementById('custom-user-css') as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-user-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = this.customCss;
  }

  private applyGlobalShortcut() {
    invoke('update_global_shortcut', { shortcutStr: this.shortcutActivate });
  }

  private applyShowTray() {
    invoke('set_tray_visible', { visible: this.showTray }).catch((err) => {
      console.error('Failed to update tray visibility:', err);
    });
  }
}

export const settingsStore = new SettingsStore();
