<script lang="ts">
  import "../app.css";
  import "../icon.css";
  import { onMount, onDestroy } from 'svelte';
  import { toast } from '$lib/toast.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import CustomDialog from '$lib/components/CustomDialog.svelte';
  import CustomTooltip from '$lib/components/CustomTooltip.svelte';

  let { children } = $props();

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === 'PrintScreen') return;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5'].includes(e.key)) return;
    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    toast.clear();
  }

  function handleGlobalMouseDown() {
    toast.clear();
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('mousedown', handleGlobalMouseDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
    window.removeEventListener('mousedown', handleGlobalMouseDown);
  });
</script>

{@render children()}

<ToastContainer />
<CustomDialog/>
<CustomTooltip/>

<style>
  @import '$lib/tokimeki/mochotto.css';
</style>
