<script lang="ts">
  import { toast } from '$lib/toast.svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
</script>

<div
  class="toast-container"
  role="region"
  aria-label="Notifications"
  onpointerenter={() => toast.clear()}
>
  {#each toast.messages as item (item.id)}
    {@const type = item.type ?? 'info'}
    <div
      class="toast-item {type}"
      role="status"
      aria-live="politic"
      in:fly={{ y: -20, duration: 600, easing: cubicOut }}
      out:fly={{ y: -20, duration: 600, easing: cubicOut }}
    >
      <span class="toast-icon icon-base icon-{type}" aria-hidden="true"></span>
      <span class="toast-content">{item.message}</span>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 99999;
    pointer-events: none;
  }

  .toast-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    background-color: var(--bg-input);
    color: var(--text-input);
    font-size: 0.9rem;
    pointer-events: auto;
    max-width: 90vw;
    backdrop-filter: blur(6px);
    box-shadow: var(--box-shadow);
  }

  .toast-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .toast-content {
    flex: 1;
    line-height: 1.4;
    text-align: left;
    white-space: pre;
  }
</style>
