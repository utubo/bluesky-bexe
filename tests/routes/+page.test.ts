// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Main Window Core Logic & Behaviors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ==========================================
  // 1. Navigation History Logic Tests
  // ==========================================
  describe('Navigation History Logic', () => {
    type HistoryItem = {
      tab: string;
      selectedUser: any | null;
      selectedThread?: string;
      scrollTop?: number;
      targetInfo: any | null;
    };

    it('should push and restore history states correctly', () => {
      let history: HistoryItem[] = [];
      let currentTab = 'timeline';
      let selectedUser: any = null;
      let targetInfo: any = null;

      const pushHistory = (scrollTop: number) => {
        history.push({
          tab: currentTab,
          selectedUser,
          targetInfo,
          scrollTop,
        });
      };

      const handleGoBack = () => {
        if (history.length === 0) return null;
        return history.pop();
      };

      // Push initial state
      pushHistory(200);
      expect(history).toHaveLength(1);
      expect(history[0].scrollTop).toBe(200);

      // Mutate state to simulate navigating deeper
      currentTab = 'thread';
      selectedUser = { handle: 'bob.test' };
      targetInfo = { type: 'reply', item: {} };

      // Go back and verify restored state
      const prevState = handleGoBack();
      expect(prevState).toMatchObject({
        tab: 'timeline',
        selectedUser: null,
        scrollTop: 200,
        targetInfo: null,
      });
      expect(history).toHaveLength(0);
    });

    it('should clear history completely', () => {
      let history = [{ tab: 'timeline', selectedUser: null, targetInfo: null }];
      const handleClearHistory = () => {
        history.length = 0;
      };

      handleClearHistory();
      expect(history).toHaveLength(0);
    });
  });

  // ==========================================
  // 2. Login & Session Restoration Flow Tests
  // ==========================================
  describe('Login & Session Restoration Flow', () => {
    it('should restore session successfully if token exists', async () => {
      const restoreSession = vi.fn().mockResolvedValue(true);
      const login = vi.fn().mockResolvedValue(true);

      let isLoggedIn = false;
      let success = await restoreSession();

      if (success) {
        isLoggedIn = true;
      }

      expect(restoreSession).toHaveBeenCalled();
      expect(isLoggedIn).toBe(true);
      expect(login).not.toHaveBeenCalled();
    });

    it('should fall back to auto-login using saved credentials if session restoration fails', async () => {
      const restoreSession = vi.fn().mockResolvedValue(false);
      const login = vi.fn().mockResolvedValue(true);

      const savedHandle = 'user.bsky.social';
      const savedPassword = 'secret-password';

      let isLoggedIn = false;
      let success = await restoreSession();

      if (!success && savedHandle && savedPassword) {
        try {
          await login(savedHandle, savedPassword);
          success = true;
        } catch (err) {
          console.error(err);
        }
      }

      if (success) {
        isLoggedIn = true;
      }

      expect(restoreSession).toHaveBeenCalled();
      expect(login).toHaveBeenCalledWith(savedHandle, savedPassword);
      expect(isLoggedIn).toBe(true);
    });

    it('should handle password persistence in localStorage based on rememberPassword flag', () => {
      const password = 'my-password-123';
      let rememberPassword = true;

      if (rememberPassword) {
        localStorage.setItem('bsky_password', password);
      } else {
        localStorage.removeItem('bsky_password');
      }

      expect(localStorage.getItem('bsky_password')).toBe(password);

      // Toggle rememberPassword off
      rememberPassword = false;
      if (!rememberPassword) {
        localStorage.removeItem('bsky_password');
      }

      expect(localStorage.getItem('bsky_password')).toBeNull();
    });
  });

  // ==========================================
  // 3. Keyboard Shortcuts & Focus Control Logic
  // ==========================================
  describe('Keyboard Shortcuts & Focus Control Logic', () => {
    it('should trigger latest reply action on Alt+R shortcut', () => {
      const handleSelectLatestReply = vi.fn();
      const isLoggedIn = true;

      const handleKeyDown = (e: { key: string; altKey: boolean }) => {
        if (!isLoggedIn) return;
        if (e.key.toLowerCase() === 'r' && e.altKey) {
          handleSelectLatestReply();
        }
      };

      handleKeyDown({ key: 'r', altKey: true });
      expect(handleSelectLatestReply).toHaveBeenCalledTimes(1);

      // Should not trigger without altKey
      handleKeyDown({ key: 'r', altKey: false });
      expect(handleSelectLatestReply).toHaveBeenCalledTimes(1);
    });

    it('should trigger scroll to top and focus on Home key unless inside input/textarea', () => {
      const scrollToTop = vi.fn();
      const focusTextarea = vi.fn();
      const isLoggedIn = true;

      const handleKeyDown = (e: { key: string; target: { tagName: string }; preventDefault: () => void }) => {
        if (!isLoggedIn) return;
        if (e.key === 'Home') {
          if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            return; // Ignore if typing in input/textarea
          }
          e.preventDefault();
          scrollToTop();
          focusTextarea();
        }
      };

      // Case 1: Pressed on body (should trigger)
      const mockEventBody = {
        key: 'Home',
        target: { tagName: 'BODY' },
        preventDefault: vi.fn(),
      };
      handleKeyDown(mockEventBody);
      expect(mockEventBody.preventDefault).toHaveBeenCalled();
      expect(scrollToTop).toHaveBeenCalled();
      expect(focusTextarea).toHaveBeenCalled();

      // Case 2: Pressed inside textarea (should ignore)
      scrollToTop.mockClear();
      focusTextarea.mockClear();
      const mockEventTextarea = {
        key: 'Home',
        target: { tagName: 'TEXTAREA' },
        preventDefault: vi.fn(),
      };
      handleKeyDown(mockEventTextarea);
      expect(mockEventTextarea.preventDefault).not.toHaveBeenCalled();
      expect(scrollToTop).not.toHaveBeenCalled();
      expect(focusTextarea).not.toHaveBeenCalled();
    });

    it('should trigger goBack on Backspace when compose box is empty', () => {
      const handleGoBack = vi.fn();
      const isLoggedIn = true;

      const handleKeyDown = (e: { key: string; preventDefault: () => void }, composeBoxHasAny: boolean) => {
        if (!isLoggedIn) return;
        if (e.key === 'Backspace' && !composeBoxHasAny) {
          e.preventDefault();
          handleGoBack();
        }
      };

      const mockEvent = { key: 'Backspace', preventDefault: vi.fn() };

      // Compose box has content -> should not trigger
      handleKeyDown(mockEvent, true);
      expect(handleGoBack).not.toHaveBeenCalled();

      // Compose box is empty -> should trigger
      handleKeyDown(mockEvent, false);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(handleGoBack).toHaveBeenCalled();
    });
  });
});
