import { toast } from '$lib/toast.svelte';

/**
 * Safely executes an asynchronous function, catching any errors and displaying a toast notification.
 */
export async function safely<T>(
  fn: () => Promise<T>,
  defaultMsg = "Error"
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err: any) {
    console.error({
      status: err?.status,
      message: err?.message,
      body: err?.body,
    });
    const msg = err?.message || defaultMsg;
    toast.showError(msg);
  }
}
