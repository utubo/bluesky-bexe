import { safely } from '$lib/errorStore.svelte';

const STORAGE_KEY = 'app_search_history';
const MAX_HISTORY_ITEMS = 10;

class SearchHistoryStore {
  // 1. Reactive state holding recent search keywords
  items = $state<string[]>([]);

  constructor() {
    this.loadHistory();
  }

  // Load history from localStorage
  private loadHistory() {
    safely(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.items = parsed;
        }
      }
    });
  }

  // Save history to localStorage
  persist() {
    safely(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    });
  }

  /**
   * Add a new search keyword to history.
   * Removes duplicates and keeps the list within the maximum limit.
   */
  addQuery(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Remove existing duplicate if present, then add to the top
    const filtered = this.items.filter((item) => item !== trimmed);
    this.items = [trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    this.persist();
  }

  /**
   * Remove a specific keyword from history.
   */
  removeQuery(query: string) {
    this.items = this.items.filter((item) => item !== query);
    this.persist();
  }

  /**
   * Clear all search history.
   */
  clearHistory() {
    this.items = [];
    this.persist();
  }
}

export const searchHistoryStore = new SearchHistoryStore();
