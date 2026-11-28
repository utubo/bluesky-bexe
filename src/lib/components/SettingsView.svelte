<script lang="ts">
  import { tick } from 'svelte';
  import { settingsStore, DEFAULT_IMAGE_FILENAME_FORMAT } from '$lib/settingsStore.svelte';
  import { msg } from '$lib/i18n.svelte';
  import { removeStoredAccount } from '$lib/auth';
  import { openConfirmDialog } from '$lib/customDialogStore.svelte';
  import { feedStore } from '$lib/feedStore.svelte';
  import versionImage from '../../assets/version.png';

  let {
    onLogout,
    accounts = [],
    currentHandle = '',
    onSwitchAccount,
  }: {
    onLogout: ( removeItem: boolean ) => void;
    accounts: { handle: string, password?: string }[];
    currentHandle: string;
    onSwitchAccount: (handle: string) => void;
  } = $props();

  let formatInputEl: HTMLInputElement | null = null;

  const fontSizes = [12, 13, 14, 15, 16, 17, 18, 19, 20];
  const delayIntervals = [20000, 30000, 45000, 60000];
  const presetColors = ['#1d9bf0', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const availableTags = $derived([
    { tag: '{displayName}', label: msg.formatTagDisplayName },
    { tag: '{handle}', label: msg.formatTagHandle },
    { tag: '{date}', label: msg.formatTagDate },
    { tag: '{time}', label: msg.formatTagTime },
    { tag: '{index}', label: msg.formatTagIndex },
    { tag: '{snippet}', label: msg.formatTagSnippet },
  ]);

  const themeOptions = $derived([
    { value: 'system', label: msg.settingThemeSystem },
    { value: 'dark', label: msg.settingThemeDark },
    { value: 'light', label: msg.settingThemeLight },
    { value: 'gray', label: msg.settingThemeGray },
    { value: 'sepia', label: msg.settingThemeSepia },
    { value: 'cream', label: msg.settingThemeCream },
  ] as const);

  function resetToInitialFormat() {
    settingsStore.set('imageFileNameFormat', DEFAULT_IMAGE_FILENAME_FORMAT);
    formatInputEl?.focus();
  }

  async function insertTag(tag: string) {
    if (!formatInputEl) return;
    formatInputEl.focus();
    await tick();

    const success = document.execCommand('insertText', false, tag);
    if (success) return;

    const start = formatInputEl.selectionStart ?? formatInputEl.value.length;
    const end = formatInputEl.selectionEnd ?? formatInputEl.value.length;
    const val = formatInputEl.value;
    const newVal = val.substring(0, start) + tag + val.substring(end);

    settingsStore.set('imageFileNameFormat', newVal);
    await tick();

    requestAnimationFrame(() => {
      if (formatInputEl) {
        formatInputEl.focus();
        const newPos = start + tag.length;
        formatInputEl.setSelectionRange(newPos, newPos);
      }
    });
  }

  function handleShortcutKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab' && !e.altKey && !e.metaKey && !e.ctrlKey) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      settingsStore.set('shortcutActivate', '');
      return;
    }

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.altKey) modifiers.push('Alt');
    if (e.metaKey) modifiers.push('Super');

    const key = e.key.toUpperCase();
    const isModifierOnly = ['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key);

    if (modifiers.length > 0 && !isModifierOnly) {
      const combo = [...modifiers, key].join('+');
      settingsStore.set('shortcutActivate', combo);
    }
  }

  async function handleRemoveAccountClick(targetAccount: string) {
    if (await openConfirmDialog(
      `${msg.dlgRemoveStoredAccount}\n${targetAccount}`
    )) {
      accounts = removeStoredAccount(targetAccount);
    }
  }
</script>

<div class="settings-container card">
  <h2>{msg.navSettings}</h2>

  <!-- Operation Settings -->
  <div class="setting-group">
    <span class="setting-title">{msg.settingOperation}</span>
    <label class="switch-label">
      <input
        type="checkbox"
        checked={settingsStore.enterToSend}
        onchange={() => settingsStore.toggle('enterToSend')}
      />
      <span class="switch-text">{msg.settingEnterToSend}</span>
    </label>

    <label class="switch-label">
      <input
        type="checkbox"
        checked={settingsStore.switchToMentionsOnNew}
        onchange={() => settingsStore.toggle('switchToMentionsOnNew')}
      />
      <span>{msg.settingSwitchToMentionsOnNew}</span>
    </label>

    <label class="switch-label">
      <input
        type="checkbox"
        checked={settingsStore.showTray}
        onchange={() => settingsStore.toggle('showTray')}
      />
      <span class="switch-text">{msg.settingShowTray}</span>
    </label>

    <!-- Auto Scroll / Blur Settings -->
    <div class="setting-item">
      <label class="sub-label">{msg.settingOnBlur}</label>
      <div class="sub-setting-group">
        <label class="switch-label">
          <input
            type="checkbox"
            checked={settingsStore.autoScrollOnBlur}
            onchange={() => settingsStore.toggle('autoScrollOnBlur')}
          />
          <span class="switch-text">{msg.settingAutoScrollOnBlur}</span>
        </label>
        <label class="switch-label">
          <input
            type="checkbox"
            checked={settingsStore.autoHideHeaderOnBlur}
            onchange={() => settingsStore.toggle('autoHideHeaderOnBlur')}
          />
          <span class="switch-text">{msg.settingAutoHideHeaderOnBlur}</span>
        </label>
      </div>
    </div>

    <!-- Image File Name Format -->
    <div class="setting-item format-setting-item">
      <label class="sub-label with-reset-btn" for="image-filename-format-input">
        {msg.settingImageFileNameFormat}
        <button
          type="button"
          class="tool-btn reset-btn"
          onclick={resetToInitialFormat}
          title={msg.reset}
        >
          <span class="icon-base icon-reset"></span>
        </button>
      </label>
      <input
        id="image-filename-format-input"
        bind:this={formatInputEl}
        type="text"
        class="setting-text-input"
        value={settingsStore.imageFileNameFormat}
        oninput={(e) => settingsStore.set('imageFileNameFormat', e.currentTarget.value)}
        placeholder={DEFAULT_IMAGE_FILENAME_FORMAT}
      />
      <div class="relative-anchor">
        <div class="tag-chips-container">
          {#each availableTags as item}
            <button
              type="button"
              class="tag-chip"
              onclick={() => insertTag(item.tag)}
              title={item.tag}
            >
              <span>{item.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Global Shortcut Settings -->
  <div class="setting-group">
    <span class="setting-title">{msg.settingShortcut}</span>
    <div class="setting-item">
      <label class="sub-label" for="shortcut-activate-input">{msg.settingShortcutActivate}</label>
      <div class="shortcut-input-wrapper">
        <input
          id="shortcut-activate-input"
          type="text"
          class="setting-text-input"
          readonly
          placeholder={msg.settingShortcutEmpty}
          value={settingsStore.shortcutActivate}
          onkeydown={handleShortcutKeydown}
        />
      </div>
    </div>
  </div>

  <!-- Timeline Settings -->
  <div class="setting-group">
    <span class="setting-title">{msg.navTimeline}</span>

    <!-- Update & Delay Interval Settings -->
    <div class="setting-item">
      <label class="sub-label" for="update-delay-select">{msg.settingUpdateDelay}</label>
      <select
        id="update-delay-select"
        class="setting-select"
        value={settingsStore.updateDelayInterval}
        onchange={(e) => settingsStore.set('updateDelayInterval', Number(e.currentTarget.value))}
      >
        {#each delayIntervals as interval}
          <option value={interval}>{interval / 1000}{msg.sec}</option>
        {/each}
      </select>
    </div>

    <!-- Expanded Post Count -->
    <div class="setting-item">
      <span class="sub-label">{msg.settingExpandedCount}</span>
      <input
        type="number"
        min="0"
        max="50"
        value={settingsStore.expandedCount}
        onchange={(e) => settingsStore.set('expandedCount', Number((e.target as HTMLInputElement).value))}
      />
    </div>

    <!-- Partial Post Count -->
    <div class="setting-item">
      <span class="sub-label">{msg.settingPartialCount}</span>
      <input
        type="number"
        min="0"
        max="50"
        value={settingsStore.partialCount}
        onchange={(e) => settingsStore.set('partialCount', Number((e.target as HTMLInputElement).value))}
      />
    </div>

    <!-- Hide unfollowed replies -->
    <div class="setting-item">
      <label class="switch-label">
        <input
          type="checkbox"
          checked={settingsStore.hideUnfollowedReplies}
          onchange={() => settingsStore.toggle('hideUnfollowedReplies')}
        />
        <span class="switch-text">{msg.settingHideUnfollowedReplies}</span>
      </label>
    </div>

    <!-- Use old repost format -->
    <div class="setting-item">
      <label class="switch-label">
        <input
          type="checkbox"
          checked={settingsStore.useOldRepostFormat}
          onchange={() => settingsStore.toggle('useOldRepostFormat')}
        />
        <span class="switch-text">{msg.settinguseOldRepostFormat}</span>
      </label>
    </div>

    <!-- Always Show Rich Content / Media Toggle -->
    <div class="setting-item">
      <label class="switch-label">
        <input
          type="checkbox"
          checked={settingsStore.alwaysShowRichContent}
          onchange={() => settingsStore.toggle('alwaysShowRichContent')}
        />
        <span class="switch-text">{msg.settingAlwaysShowRichContent}</span>
      </label>
      <label class="switch-label sub-item">
        <input
          type="checkbox"
          checked={settingsStore.showMediaToggleInToolbar}
          onchange={() => settingsStore.toggle('showMediaToggleInToolbar')}
        />
        <span>{msg.settingShowMediaToggleInToolbar}</span>
      </label>
    </div>
  </div>

  <!-- Appearance & Theme Settings -->
  <div class="setting-group">
    <span class="setting-title">{msg.settingAppearance}</span>

    <div class="setting-item">
      <label class="sub-label" for="theme-select">{msg.settingTheme}</label>
      <select
        id="theme-select"
        class="setting-select"
        value={settingsStore.theme}
        onchange={(e) => settingsStore.set('theme', (e.target as HTMLInputElement).value)}
      >
        {#each themeOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>

    <div class="setting-item">
      <label class="sub-label">{msg.settingAccentColor}</label>
      <div class="color-picker-container">
        <div class="color-picker-wrapper">
          <input
            type="color"
            value={settingsStore.accentColor}
            oninput={(e) => settingsStore.set('accentColor', (e.target as HTMLInputElement).value)}
          />
          <span class="color-code">{settingsStore.accentColor}</span>
        </div>
        <div class="color-palette">
          <div class="palette-chip custom-color-chip">
            <input
              type="color"
              value={settingsStore.accentColor}
              oninput={(e) => settingsStore.set('accentColor', (e.target as HTMLInputElement).value)}
            />
          </div>
          {#each presetColors as color}
            <button
              type="button"
              class="palette-chip"
              style="background-color: {color};"
              class:active={settingsStore.accentColor.toLowerCase() === color.toLowerCase()}
              onclick={() => settingsStore.set('accentColor', color)}
              title={color}
            ></button>
          {/each}
        </div>
      </div>
    </div>

    <div class="setting-item">
      <label class="sub-label" for="font-size-select">{msg.settingFontSize}</label>
      <select
        id="font-size-select"
        class="setting-select"
        value={settingsStore.fontSize}
        onchange={(e) => settingsStore.set('fontSize', Number((e.target as HTMLInputElement).value))}
      >
        {#each fontSizes as size}
          <option value={size}>{size}</option>
        {/each}
      </select>
    </div>

    <!-- Toolbar Opacity Setting -->
    <div class="setting-item">
      <label class="sub-title">{msg.settingToolbarOpacity} ({settingsStore.toolbarOpacity}%)</label>
      <div class="slider-container">
        <input type="range" min="0" max="100"
          value={settingsStore.toolbarOpacity}
          oninput={(e) => settingsStore.set('toolbarOpacity', Number((e.target as HTMLInputElement).value))}
          class="toolbar-opacity-slider"
        />
      </div>
    </div>

    <div class="setting-item">
      <label class="sub-label" for="custom-css-textarea">{msg.settingCustomCSS}</label>
      <textarea
        id="custom-css-textarea"
        class="custom-css-input"
        value={settingsStore.customCss}
        oninput={(e) => settingsStore.setCustomCss(e.currentTarget.value)}
        placeholder={`/* example */
:root {
  --text-main: #0f1419;
  --text-muted: #536471;
  --text-input: #0f1419;
  --bg-app: #ffffff;
  --bg-card: #f7f9f9;
  --bg-input: #eff3f4;
  --border-color: #9995;
  --border-input: #cfd9de;
}`}
        rows="11"
      ></textarea>
    </div>
  </div>

  <!-- Account Management Section -->
  <div class="setting-group logout-section">
    <span class="setting-title">{msg.settingAccount}</span>

    <!-- Registered Accounts List for Quick Switching -->
    {#if accounts.length > 0}
      <div class="accounts-list">
        {#each accounts as acc}
          <div class="account-row">
            <span class="account-handle-text">{acc.handle}</span>
            {#if acc.handle === currentHandle}
              <span class="active-tag">{msg.settingActiveAccount}</span>
            {:else}
              <button
                type="button"
                class="btn-secondary btn-danger remove-btn"
                onclick={() => handleRemoveAccountClick(acc.handle)}
              >{msg.remove}</button>
              <button
                type="button"
                class="btn-secondary btn-secondary switch-btn"
                onclick={() => onSwitchAccount(acc.handle)}
              >{msg.settingSwtichAccount}</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="account-actions">
      <button type="button" class="btn-secondary btn-danger" onclick={onLogout}>
        {msg.authLogout}
      </button>
    </div>
  </div>

  <!-- Experimental -->
  <div class="setting-group external-section">
    <span class="setting-title">{msg.settingExperimental}</span>

    <!-- Prevent Missing Mentions -->
    <label class="switch-label">
      <input
        type="checkbox"
        checked={settingsStore.preventMissingMentions}
        onchange={() => settingsStore.toggle('preventMissingMentions')}
      />
      <span>{msg.settingPreventMissingMentions}</span>
    </label>

    <!-- Enable Process Mentions -->
    <label class="switch-label">
      <input
        type="checkbox"
        checked={settingsStore.enableProcessMentions}
        onchange={() => {
          settingsStore.toggle('enableProcessMentions');
          feedStore.resetCurrentPosts('mentions');
        }}
      />
      <span>{msg.settingEnableProcessMentions}</span>
    </label>
  </div>
</div>
<div class="build-time-text">Build: {__BUILD_TIME__}</div>
<div
  class="version-image"
  style="mask-image: url({versionImage}); -webkit-mask-image: url({versionImage});"
></div>

<style>
  .settings-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 12px;
    max-width: 100%;
    margin: 0;
    box-sizing: border-box;
  }
  h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-main);
    margin: 0;
  }

  input[type=number] {
    margin-top: 4px;
    padding-left: 1rem;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border-color);
  }
  .setting-group:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .sub-setting-group {
    margin-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .setting-title {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--text-main);
  }

  .setting-item {
    width: 100%;
    margin-top: 4px;
  }

  .sub-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 4px;
    display: block;
  }

  .setting-select {
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-input);
    background-color: var(--bg-input);
    color: var(--text-input);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .setting-select:focus {
    outline: none;
    border-color: var(--accent-color);
  }
  .setting-select option {
    background-color: var(--bg-card);
    color: var(--text-main);
  }

  .switch-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-main);
    user-select: none;
    margin: 0;
    line-height: 1.4;
  }
  .switch-label input {
    cursor: pointer;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: var(--accent-color);
  }
  .switch-label:hover {
    background: var(--bg-btn-hover);
  }
  .switch-label input:focus {
    outline: 2px solid var(--bg-btn-hover);
  }
  .switch-text {
    font-size: 0.9rem;
  }

  .color-picker-container {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .color-picker-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .color-picker-wrapper input[type="color"] {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--border-input);
    border-radius: 6px;
    background: none;
    cursor: pointer;
  }
  .color-picker-wrapper input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .color-picker-wrapper input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
  .color-code {
    font-size: 0.9rem;
    font-family: monospace;
    color: var(--text-muted);
  }

  .color-palette {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .palette-chip {
    box-sizing: border-box;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s, border-color 0.15s;
  }
  .palette-chip:hover, .palette-chip:focus {
    transform: scale(1.2) !important;
  }
  .palette-chip.active {
    border-color: var(--text-main);
    transform: scale(1.1);
  }
  .custom-color-chip {
    position: relative;
    background: var(--bg-input);
    border: 1px solid var(--border-input);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .custom-color-chip::before {
    position: absolute;
    display: inline-block;
    content: '';
    width: 22px;
    height: 22px;
    --svg-plus: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22' fill='none' stroke='currentColor' stroke-width='1' %3E%3Cpath d='M11 6v10m-5-5h10'/%3E%3C/svg%3E");
    -webkit-mask-image: var(--svg-plus);
    mask-image: var(--svg-plus);
    background-color: var(--text-input);
  }

  .custom-color-chip input[type="color"] {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  .custom-css-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px;
    border-radius: 6px;
    border: 1px solid var(--border-input);
    background-color: var(--bg-input);
    color: var(--text-main);
    font-family: monospace;
    font-size: 0.85rem;
    resize: vertical;
  }
  .custom-css-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .build-time-text {
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
    width: 100%;
  }

  .sub-item {
    margin: .5rem 0 0 2rem;
    position: relative;
  }

  .sub-item::before {
    content: '';
    border-bottom: 2px solid var(--border-color);
    border-left: 2px solid var(--border-color);
    display: inline-block;
    width: 0.7rem;
    height: 1rem;
    position: absolute;
    top: -.3rem;
    left: -1.1rem;
  }

  .setting-text-input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-input);
    background-color: var(--bg-input);
    color: var(--text-main);
    font-size: 0.9rem;
  }
  .setting-text-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .with-reset-btn {
    display: flex;
    align-items: center;
  }

  .format-setting-item:focus-within .tag-chips-container {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .reset-btn {
    color: var(--text-muted);
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    display: inline-flex;
    align-items: center;
    border-radius: 50%;
  }

  .reset-btn:focus, .reset-btn:hover {
    background: color-mix(in srgb, var(--danger-color) 30%, var(--bg-card)) !important;
    color: var(--danger-color) !important;
  }

  .relative-anchor {
    position: relative;
  }

  .tag-chips-container {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-card);
    border: 1px solid var(--border-input);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
    box-shadow: var(--box-shadow);
    z-index: 30;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: opacity 0.2s ease, transform 0.15s ease, visibility 0.15s;
    pointer-events: auto;
  }

  .tag-chips-container::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 20px;
    width: 10px;
    height: 10px;
    background: var(--bg-card);
    border-top: 1px solid var(--border-input);
    border-left: 1px solid var(--border-input);
    transform: rotate(45deg);
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    background-color: var(--bg-input);
    border: 1px solid var(--border-input);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.8rem;
    color: var(--text-main);
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }

  .tag-chip:hover, .tag-chip:focus {
    color: var(--accent-color);
    border-color: var(--accent-color);
    background-color: color-mix(in srgb, var(--accent-color) 10%, var(--bg-input));
    transform: translateY(-1px);
  }

  .version-image {
    background-color: var(--text-muted);
    width: 100%;
    aspect-ratio: 1 / 1;
    mask-size: contain;
  }

  /* Account switcher list styles */
  .accounts-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .account-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background-color: var(--bg-input);
    border: 1px solid var(--border-input);
    border-radius: 6px;
  }

  .account-handle-text {
    font-size: var(--font-md);
    color: var(--text-main);
    word-break: break-all;
    margin-right: auto;
  }

  .active-tag,
  .switch-btn,
  .remove-btn {
    font-size: var(--font-xs);
    padding: 2px 8px;
    border-radius: 4px;
    margin: 0;
  }

  .active-tag {
    cursor: default;
  }

  .switch-btn {
    cursor: pointer;
  }

  .remove-btn {
    cursor: pointer;
  }

  .slider-container {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 4px 0;
  }

  .toolbar-opacity-slider {
    max-width: 100%;
    width: 10em;
    padding: 0;
    accent-color: var(--accent-color);
    cursor: pointer;
    margin: 0;
  }
</style>
