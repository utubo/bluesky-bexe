<script lang="ts">
  import { fade } from 'svelte/transition';
  import { msg } from '$lib/i18n.svelte';
  import { customDialogStore, closeDialog } from '$lib/customDialogStore.svelte';

  let inputValue = $state('');
  let dialogElement = $state<HTMLDivElement | null>(null);
  let inputElement = $state<HTMLInputElement | null>(null);
  let showDropdown = $state(false);

  // Reset local input and dropdown state when dialog opens
  $effect(() => {
    if (customDialogStore.isOpen) {
      inputValue = customDialogStore.initialValue;
      showDropdown = false;
    }
  });

  $effect(() => {
    if (customDialogStore.isOpen) {
      const timer = setTimeout(() => {
        focusDefaultElement();
      }, 50);
      return () => clearTimeout(timer);
    }
  });

  $effect(() => {
    if (!customDialogStore.isOpen) return;

    function handleGlobalFocusIn(e: FocusEvent) {
      if (!dialogElement) return;
      const target = e.target as HTMLElement;
      if (!dialogElement.contains(target)) {
        e.stopPropagation();
        focusDefaultElement();
      }
    }
    document.addEventListener('focusin', handleGlobalFocusIn, true);
    return () => {
      document.removeEventListener('focusin', handleGlobalFocusIn, true);
    };
  });

  function focusDefaultElement() {
    if (customDialogStore.showInput && inputElement) {
      inputElement.focus();
    } else {
      dialogElement?.focus();
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (customDialogStore.showIconPicker) {
      closeDialog(inputValue || null);
      return;
    }
    if (customDialogStore.showInput) {
      const trimmed = inputValue.trim();
      if (trimmed) {
        closeDialog(trimmed);
      }
    } else {
      closeDialog('ok');
    }
  }

  function handleSelectSuggestion(item: string) {
    inputValue = item;
    showDropdown = false;
    inputElement?.focus();
  }

  function handleRemoveSuggestion(e: MouseEvent, index: number) {
    e.stopPropagation();
    // Remove specific item from suggestions array reactively if mutable,
    // or notify via custom callback / store method if needed.
    if (customDialogStore.suggestions && Array.isArray(customDialogStore.suggestions)) {
      customDialogStore.suggestions.splice(index, 1);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog(null);
      return;
    }

    if (e.key === 'Tab' && dialogElement) {
      const focusableElements = dialogElement.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if customDialogStore.isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="dialog-overlay"
    onclick={() => closeDialog(null)}
    onkeydown={handleKeyDown}
    transition:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="dialog-card"
      bind:this={dialogElement}
      onclick={(e) => e.stopPropagation()}
      tabindex="-1"
    >
      {#if customDialogStore.title}
        <h3 class="dialog-title">{customDialogStore.title}</h3>
      {/if}

      {#if customDialogStore.message}
        <p class="dialog-message">{customDialogStore.message}</p>
      {/if}

      {#if customDialogStore.imageUrl}
        <img src={customDialogStore.imageUrl} alt="Dialog content" class="dialog-image" />
      {/if}

      <form onsubmit={handleSubmit}>
        {#if customDialogStore.showIconPicker}
          <div class="icon-picker-grid">
            {#each customDialogStore.iconPresets as presetClass}
              <button
                type="button"
                class="icon-picker-item"
                class:selected={inputValue === presetClass}
                onclick={() => closeDialog(presetClass) }
              >
                <span class="icon-base {presetClass} no-active"></span>
              </button>
            {/each}
          </div>
          <div class="icon-picker-reset-row">
            <button
              type="button"
              class="dialog-btn reset"
              onclick={() => closeDialog('')}
            >
              {msg.reset || 'Reset'}
            </button>
          </div>
        {:else}
          {#if customDialogStore.showInput}
            <div class="input-container">
              <input
                type="text"
                bind:this={inputElement}
                bind:value={inputValue}
                placeholder={customDialogStore.placeholder}
                autofocus
                class="dialog-input"
              />

              {#if customDialogStore.suggestions && customDialogStore.suggestions.length > 0}
                <!-- Toggle button (▼) on the right side of the input -->
                <button
                  type="button"
                  class="dropdown-toggle-btn"
                  title="Toggle suggestions"
                  onclick={() => (showDropdown = !showDropdown)}
                >
                  ▼
                </button>

                <!-- Custom suggestions dropdown (Max 5 items visible, scrollable from 6th) -->
                {#if showDropdown}
                  <div class="suggestions-dropdown" transition:fade={{ duration: 100 }}>
                    <ul class="suggestions-list">
                      {#each customDialogStore.suggestions as suggestion, index}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                        <li class="suggestion-item" onclick={() => handleSelectSuggestion(suggestion)}>
                          <span class="suggestion-text">{suggestion}</span>
                          <button
                            type="button"
                            class="suggestion-remove-btn"
                            title="Remove item"
                            onclick={(e) => handleRemoveSuggestion(e, index)}
                          >
                            ×
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              {/if}
            </div>
          {/if}

          <div class="dialog-actions">
            <button type="button" class="dialog-btn cancel" onclick={() => closeDialog(null)}>
              {msg.cancel || "Cancel"}
            </button>
            <button type="submit" class="dialog-btn submit">
              {msg.ok || "OK"}
            </button>
          </div>
        {/if}
      </form>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .dialog-card {
    background-color: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 16px;
    width: 100%;
    max-width: 320px;
    box-shadow: var(--box-shadow);
    outline: none;
  }

  .dialog-title {
    margin: 0 0 12px 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .dialog-message {
    margin: 0 0 12px 0;
    font-size: var(--font-lg);
    color: var(--text-main);
    white-space: pre-wrap;
    line-height: 1;
  }

  .dialog-image {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .input-container {
    position: relative;
    margin-bottom: 16px;
  }

  .dialog-input {
    width: 100%;
    padding: 8px 32px 8px 12px; /* Extra padding on the right for the ▼ button */
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background-color: var(--bg-input, var(--bg-card));
    color: var(--text-main);
    font-size: 0.9rem;
    box-sizing: border-box;
    outline: none;
  }

  .dialog-input:focus {
    border-color: var(--accent-color);
  }

  /* Right-side toggle button (▼) */
  .dropdown-toggle-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 4px;
  }

  .dropdown-toggle-btn:hover {
    color: var(--text-main);
  }

  /* Suggestions Dropdown Styles */
  .suggestions-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background-color: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10;
    /* Height calculation for max 5 items (~32px per item) */
    max-height: 160px;
    overflow-y: auto;
  }

  .suggestions-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
  }

  .suggestion-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    font-size: 0.85rem;
    color: var(--text-main);
    cursor: pointer;
  }

  .suggestion-item:hover {
    background-color: var(--bg-gray-hover, rgba(0, 0, 0, 0.05));
  }

  .suggestion-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-grow: 1;
  }

  .suggestion-remove-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    border-radius: 4px;
  }

  .suggestion-remove-btn:hover {
    background-color: var(--border-color);
    color: var(--text-main);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .dialog-btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .dialog-btn.cancel {
    background-color: transparent;
    color: var(--text-muted, var(--text-main));
  }

  .dialog-btn.cancel:hover, .dialog-btn.cancel:focus {
    background-color: var(--bg-gray-hover);
  }

  .dialog-btn.submit {
    background-color: var(--accent-color);
    color: var(--text-btn-primary);
  }

  .dialog-btn.submit:hover, .dialog-btn.submit:focus {
    opacity: 0.8;
  }

  .icon-picker-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }

  .icon-picker-item {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background-color: var(--bg-input, var(--bg-card));
    color: var(--text-main);
    font-size: 1.1rem;
  }

  .icon-picker-item.selected {
    border-color: var(--accent-color);
    background-color: var(--bg-btn-hover);
    color: var(--accent-color);
  }

  .dialog-btn.reset {
    background-color: transparent;
    color: var(--text-muted);
    padding: 4px 8px;
  }

  .dialog-btn.reset:hover,
  .dialog-btn.reset:focus {
    background-color: var(--bg-gray-hover);
    color: var(--text-main);
  }

  .icon-picker-reset-row {
    display: flex;
    justify-content: flex-end;
  }
</style>
