import { tick } from 'svelte';
import {
  confirm as dlgConfirm,
  ask as dlgAsk,
  save as dlgSave,
  type ConfirmDialogOptions,
  type SaveDialogOptions
} from '@tauri-apps/plugin-dialog';

class DialogStore {
  isOpen = $state<boolean>(false);

  /**
   * A common wrapper that executes an asynchronous function while managing the dialog open state.
   */
  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    this.isOpen = true;
    await tick();
    try {
      return await fn();
    } finally {
      await tick();
      this.isOpen = false;
    }
  }
}

export const dialog = new DialogStore();

export async function confirm(msg: string, options?: string | ConfirmDialogOptions) {
  return dialog.wrap(() => dlgConfirm(msg, options));
}

export async function ask(msg: string, options?: string | ConfirmDialogOptions) {
  return dialog.wrap(() => dlgAsk(msg, options));
}

export async function save(options: SaveDialogOptions) {
  return dialog.wrap(() => dlgSave(options));
}
