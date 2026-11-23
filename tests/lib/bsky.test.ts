// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  restoreSession,
  login,
  logout,
  getTimeline,
  postText,
  getMentions,
  getPostLikes,
  getPostReposts,
  agent
} from '$lib/bsky';
import type { normalize } from '@tauri-apps/api/path';
import type { prefersReducedMotion } from 'svelte/motion';

// Mock AtpAgent methods
vi.spyOn(agent, 'resumeSession').mockResolvedValue(undefined as any);
vi.spyOn(agent, 'login').mockResolvedValue({ success: true, data: { accessJwt: 'jwt' } } as any);
vi.spyOn(agent, 'getTimeline').mockResolvedValue({ success: true, data: { feed: [{ id: '1' }] } } as any);
vi.spyOn(agent, 'getAuthorFeed').mockResolvedValue({
  success: true,
  data: {
    feed: [
      {
        post: {
          uri: 'at://my/reply/1',
          text: 'My Reply',
          record: {
            reply: {
              parent: { uri: 'at://notif/1' }
            }
          }
        }
      }
    ],
    cursor: ''
  }
} as any);
vi.spyOn(agent, 'post').mockResolvedValue({ uri: 'at://post/1', cid: 'bafyreig...' } as any);
vi.spyOn(agent, 'listNotifications').mockResolvedValue({
  success: true,
  data: {
    notifications: [
      { uri: 'at://notif/1', reason: 'reply', record: { reply: { parent: { uri: 'at://parent/1' } } } , isRead: true, indexedAt: '' }
    ]
  }
} as any);
vi.spyOn(agent, 'getPosts').mockResolvedValue({
  success: true,
  data: {
    posts: [
      { uri: 'at://notif/1', text: 'Hello' },
      { uri: 'at://parent/1', text: 'Parent Post' },
      { uri: 'at://my/reply/1', text: 'My Reply' }
    ]
  }
} as any);
vi.spyOn(agent, 'getLikes').mockResolvedValue({
  success: true,
  data: { likes: [{ actor: { handle: 'user1.test' } }] }
} as any);
vi.spyOn(agent, 'getRepostedBy').mockResolvedValue({
  success: true,
  data: { repostedBy: [{ handle: 'user2.test' }] }
} as any);
vi.mock('$lib/settingsStore.svelte', () => ({
  settingsStore: {
    preventMissingMentions: false,
  },
}));

describe('bsky.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should return false when restoring non-existent session', async () => {
    const res = await restoreSession();
    expect(res).toBe(false);
  });

  it('should login successfully and store session', async () => {
    await login('user@test.com', 'password');
    expect(localStorage.getItem('bsky_session_data')).toBeTruthy();
  });

  it('should logout and remove session from storage', async () => {
    localStorage.setItem('bsky_session_data', 'json');
    logout();
    expect(localStorage.getItem('bsky_session_data')).toBeNull();
  });

  it('should fetch timeline feed', async () => {
    const res = await getTimeline();
    expect(res.feed).toHaveLength(1);
  });

  it('should send post text successfully', async () => {
    await expect(postText('Hello Bluesky!')).resolves.toEqual({
      uri: 'at://post/1',
      cid: 'bafyreig...',
    });
  });

  it('should fetch and enrich mentions without actor', async () => {
    vi.spyOn(agent, 'session', 'get').mockReturnValue({
      did: 'did:plc:myuser',
      handle: 'myuser.test',
      email: 'test@example.com',
      emailConfirmed: true,
      accessJwt: 'jwt',
      refreshJwt: 'jwt',
      active: true,
    });
    const res = await getMentions();
    const items = res.feed;
    // Now both notification items and user replies are merged and sorted
    expect(items.length).toBeGreaterThanOrEqual(1);

    // Find the notification item
    const notifItem = items.find(i => i.reason === 'reply');
    expect(notifItem).toBeDefined();
    expect(notifItem?.post.text).toBe('Hello');
    expect(notifItem?.reply?.parent?.text).toBe('Parent Post');
  });

  it('should fetch mentions and map user replies when actor is provided', async () => {
    vi.spyOn(agent, 'session', 'get').mockReturnValue({
      did: 'did:plc:myuser',
      handle: 'myuser.test',
      email: 'test@example.com',
      emailConfirmed: true,
      accessJwt: 'jwt',
      refreshJwt: 'jwt',
      active: true,
    });
    const res = await getMentions();
    const items = res.feed;

    // Both the notification and the user's reply are included in the flattened feed
    const notifItem = items.find(i => i.reason === 'reply');
    const myReplyItem = items.find(i => i.reason === 'user_reply');

    expect(notifItem).toBeDefined();
    expect(notifItem?.post.text).toBe('Hello');

    expect(myReplyItem).toBeDefined();
    expect(myReplyItem?.post.text).toBe('My Reply');
    expect(myReplyItem?.reply?.parent?.text).toBe('Hello'); // Parent of user's reply is the notification post
  });

  it('should fetch post likes successfully', async () => {
    const likes = await getPostLikes('at://test/post/1');
    expect(agent.getLikes).toHaveBeenCalledWith({ uri: 'at://test/post/1', limit: 3 });
    expect(likes).toHaveLength(1);
  });

  it('should fetch post reposts successfully', async () => {
    const reposts = await getPostReposts('at://test/post/1');
    expect(agent.getRepostedBy).toHaveBeenCalledWith({ uri: 'at://test/post/1', limit: 3 });
    expect(reposts).toHaveLength(1);
  });
});
