// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import SettingsView from '$lib/components/SettingsView.svelte';

// Mock settingsStore
vi.mock('$lib/settingsStore.svelte', () => ({
  settingsStore: {
    enterToSend: false,
    switchToMentionsOnNew: true,
    showTray: false,
    autoScrollOnBlur: true,
    autoHideHeaderOnBlur: false,
    alwaysShowRichContent: true,
    showMediaToggleInToolbar: true,
    expandedCount: 0,
    partialCount: 4,
    imageFileNameFormat: '{displayName}_{date}_{time}_{index}_{snippet}',
    shortcutActivate: '',
    updateDelayInterval: 45000,
    theme: 'system',
    accentColor: '#1d9bf0',
    fontSize: 16,
    customCss: '',
    toggle: vi.fn(),
    set: vi.fn(),
    setCustomCss: vi.fn(),
  },
  DEFAULT_IMAGE_FILENAME_FORMAT: '{displayName}_{date}_{time}_{index}_{snippet}',
}));

// Mock i18n
vi.mock('$lib/i18n.svelte', () => ({
  msg: {
    navSettings: 'Settings',
    settingOperation: 'Operation',
    settingEnterToSend: 'Press Enter to send',
    settingSwitchToMentionsOnNewTitle: 'Switch to mentions on new',
    settingShowTray: 'Show tray icon',
    settingOnBlur: 'On Blur',
    settingAutoScrollOnBlur: 'Auto scroll on blur',
    settingAutoHideHeaderOnBlur: 'Auto hide header on blur',
    settingImageFileNameFormat: 'Image File Name Format',
    settingShortcut: 'Shortcut',
    settingShortcutActivate: 'Activate Shortcut',
    settingShortcutEmpty: 'None',
    navTimeline: 'Timeline',
    settingUpdateDelay: 'Update Delay',
    sec: 's',
    settingExpandedCount: 'Expanded Count',
    settingPartialCount: 'Partial Count',
    settingAlwaysShowRichContent: 'Always show rich content',
    settingShowMediaToggleInToolbar: 'Show media toggle in toolbar',
    settingAppearance: 'Appearance',
    settingTheme: 'Theme',
    settingThemeSystem: 'System',
    settingThemeDark: 'Dark',
    settingThemeLight: 'Light',
    settingThemeSepia: 'Sepia',
    settingThemeCream: 'Cream',
    settingAccentColor: 'Accent Color',
    settingFontSize: 'Font Size',
    settingCustomCSS: 'Custom CSS',
    settingAccount: 'Account',
    authLogout: 'Logout',
    reset: 'Reset',
    formatTagDisplayName: 'Display Name',
    formatTagHandle: 'Handle',
    formatTagDate: 'Date',
    formatTagTime: 'Time',
    formatTagIndex: 'Index',
    formatTagSnippet: 'Snippet',
  },
}));

describe('SettingsView.svelte', () => {
  const defaultProps = {
    onLogout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render settings sections and elements correctly', () => {
    const { getByText, getByLabelText } = render(SettingsView, { props: defaultProps });

    expect(getByText('Settings')).toBeInTheDocument();
    expect(getByText('Operation')).toBeInTheDocument();
    expect(getByLabelText('Press Enter to send')).toBeInTheDocument();
    expect(getByText('Logout')).toBeInTheDocument();
  });

  it('should call onLogout when logout button is clicked', async () => {
    const onLogout = vi.fn();
    const { getByText } = render(SettingsView, { props: { onLogout } });

    await fireEvent.click(getByText('Logout'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
