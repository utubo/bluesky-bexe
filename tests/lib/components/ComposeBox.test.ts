// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ComposeBox from '$lib/components/ComposeBox.svelte';
import { getDisplayName } from '$lib/bsky';

// Mock external dependencies
vi.mock('$lib/i18n.svelte', () => ({
  msg: {
    composerPlaceholderEnter: 'Press Enter to post',
    composerPlaceholderNormal: 'Type message',
    composerPlaceholderEsc: 'Esc to cancel',
    composerPlaceholderAltR: 'Alt+R',
    composerUserFallback: 'User',
    composerBannerReply: 'Replying to {authorName}',
    composerBannerUserReply: 'Mentioning {authorName}',
    composerBannerQuote: 'Quoting {authorName}',
    composerCancel: 'Cancel',
    composerRemoveImage: 'Remove image',
    composerSelectImage: 'Attach image',
    toastPostFailed: 'Failed to post',
  },
  fmt: (str: string, params: Record<string, string>) => {
    return str.replace('{authorName}', params.authorName || '');
  },
}));

vi.mock('$lib/errorStore.svelte', () => ({
  safely: vi.fn(async (fn) => {
    return typeof fn === 'function' ? await fn() : fn;
  }),
}));

vi.mock('$lib/settingsStore.svelte', () => ({
  settingsStore: {
    enterToSend: true,
  },
}));

vi.mock('$lib/bsky', () => ({
  postText: vi.fn().mockResolvedValue({ uri: 'at://test/post', cid: 'cid123' }),
  postReply: vi.fn().mockResolvedValue({ uri: 'at://test/reply', cid: 'cid456' }),
  postQuote: vi.fn().mockResolvedValue({ uri: 'at://test/quote', cid: 'cid789' }),
  postWithImages: vi.fn().mockResolvedValue({ uri: 'at://test/image', cid: 'cid000' }),
  getDisplayName: vi.fn().mockReturnValue('Alice'),
}));

vi.mock('$lib/feedStore.svelte', () => ({
  feedStore: {
    invalidateMentionCache: vi.fn(),
  },
}));

describe('ComposeBox.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render textarea with correct placeholder', () => {
    const { getByRole } = render(ComposeBox, {
      props: {
        onPostSuccess: vi.fn(),
        onMoveToTimelineTab: vi.fn(),
        onMoveToTimeline: vi.fn(),
      },
    });

    const textarea = getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.placeholder).toContain('Press Enter to post');
  });

  it('should allow typing and check hasAny helper method', async () => {
    const componentRef = render(ComposeBox, {
      props: {
        onPostSuccess: vi.fn(),
        onMoveToTimelineTab: vi.fn(),
        onMoveToTimeline: vi.fn(),
      },
    });

    const textarea = componentRef.getByRole('textbox') as HTMLTextAreaElement;
    
    // Initially empty
    expect(componentRef.component.hasAny()).toBe(false);

    // Type content
    await fireEvent.input(textarea, { target: { value: 'Hello Bluesky!' } });
    expect(textarea.value).toBe('Hello Bluesky!');
    expect(componentRef.component.hasAny()).toBe(true);
  });

  it('should render target banner when composeTarget is provided', () => {
    const composeTarget = {
      type: 'reply' as const,
      item: {
        post: {
          uri: 'at://target/1',
          cid: 'cidtarget',
          author: { handle: 'alice.test', displayName: 'Alice' },
          record: { text: 'Original post snippet here' },
        },
      },
    };

    const { getByText } = render(ComposeBox, {
      props: {
        composeTarget,
        onCancel: vi.fn(),
        onPostSuccess: vi.fn(),
        onMoveToTimelineTab: vi.fn(),
        onMoveToTimeline: vi.fn(),
      },
    });

    expect(getByText('Replying to Alice')).toBeTruthy();
    expect(getByText('Original post snippet here...')).toBeTruthy();
  });

  it('should execute post submission and trigger postText with correct result passed to onPostSuccess', async () => {
    const onPostSuccess = vi.fn();
    const onMoveToTimelineTab = vi.fn();

    const { getByRole } = render(ComposeBox, {
      props: {
        onPostSuccess,
        onMoveToTimelineTab,
        onMoveToTimeline: vi.fn(),
      },
    });

    const textarea = getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: 'Test post submission' } });

    // Dispatch Enter keydown event to trigger handlePost
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      shiftKey: false,
    });
    Object.defineProperty(event, 'nativeEvent', {
      value: { isComposing: false },
    });
    textarea.dispatchEvent(event);

    await tick();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const { postText } = await import('$lib/bsky');
    
    // If postText was invoked, the IIFE executed successfully.
    // If someone removes the "()" from "await (async () => { ... })();", postText will NOT be called and this expect will fail.
    expect(postText).toHaveBeenCalledWith('Test post submission');
    expect(onPostSuccess).toHaveBeenCalledWith({ uri: 'at://test/post', cid: 'cid123' });
  });
});
