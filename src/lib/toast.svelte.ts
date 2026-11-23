type ToastType = 'info' | 'success' | 'error' | 'like' | 'repost' | 'reply' | 'bookmark';


export interface ToastMessage {
  id: string;
  message: string;
  type?: ToastType;
}

class ToastManager {
  messages = $state<ToastMessage[]>([]);

  /** Displays a toast message (default duration is 4 seconds) */
  show(
    message: string,
    type: ToastType = 'info',
    duration = 4000
  ) {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { id, message, type };

    this.messages = [...this.messages, newToast];

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  /** Displays an error toast message */
  showError(message: string, duration = 4000) {
    this.show(message, 'error', duration);
  }

  /** Removes a toast message by its ID */
  remove(id: string) {
    this.messages = this.messages.filter((t) => t.id !== id);
  }

  /** Clears all toast messages */
  clear() {
    this.messages = [];
  }
}

export const toast = new ToastManager();
