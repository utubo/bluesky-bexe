import { msg } from '$lib/i18n.svelte';
import type { TabType } from '$lib/feedStore.svelte';
import type { MyFeed } from '$lib/bsky';
import { openIconPickerDialog } from '$lib/customDialogStore.svelte';
import { settingsStore } from '$lib/settingsStore.svelte';

export type ToolbarItemType =
  | 'tab'
  | 'feeds'
  | 'search'
  | 'repeat_search'
  | 'my_posts'
  | 'pinned_feed'
  | 'pinned_list'
  | 'pinned_search';

export interface ToolbarItemDefinition {
  id: string;
  type: ToolbarItemType;
  tab?: TabType;
  title: string;
  sub?: string;
  query?: string;
  uri?: string;
  avatar?: string;
  icon?: string;
}

export const PINNED_ICON_PRESETS = [
  'icon-feed',
  'icon-search',
  'icon-timeline',
  'icon-mentions',
  'icon-notifications',
  //
  'icon-likes',
  'icon-star',
  'icon-bookmarks',
  'icon-user',
  'icon-family',
  //
  'icon-thread',
  'icon-speech',
  'icon-image',
  'icon-video',
  'icon-news',
  //
  'icon-book',
  'icon-code',
  'icon-1',
  'icon-2',
  'icon-3',
  //
  'icon-food',
  'icon-music',
  'icon-game',
  'icon-drive',
  'icon-paw',
] as const;

export type PinnedIconPreset = (typeof PINNED_ICON_PRESETS)[number];

export const TOOLBAR_ITEM_DEFINITIONS: Record<string, ToolbarItemDefinition> = {
  timeline: {
    id: 'timeline',
    type: 'tab',
    tab: 'timeline',
    title: msg.navTimeline,
    sub: msg.navScrollToTop,
  },
  mentions: {
    id: 'mentions',
    type: 'tab',
    tab: 'mentions',
    title: msg.navMentions,
    sub: msg.refresh,
  },
  likes: {
    id: 'likes',
    type: 'tab',
    tab: 'likes',
    title: msg.navLikes,
    sub: msg.refresh,
  },
  bookmarks: {
    id: 'bookmarks',
    type: 'tab',
    tab: 'bookmarks',
    title: msg.navBookmarks,
    sub: msg.refresh,
  },
  notifications: {
    id: 'notifications',
    type: 'tab',
    tab: 'notifications',
    title: msg.navNotifications,
    sub: msg.refresh,
  },
  feeds: {
    id: 'feeds',
    type: 'feeds',
    title: msg.navMyFeeds,
  },
  search: {
    id: 'search',
    type: 'search',
    title: msg.navSearch,
  },
  repeat_search: {
    id: 'repeat_search',
    type: 'repeat_search',
    title: msg.navRepeatSearch,
  },
  my_posts: {
    id: 'my_posts',
    type: 'my_posts',
    title: msg.navMyPosts,
  },
};

export const ALL_TOOLBAR_ITEM_IDS = Object.keys(TOOLBAR_ITEM_DEFINITIONS);

/**
 * Return toolbar item definitions that are not currently present in active items.
 */
export function getHiddenToolbarItems(
  activeItems: ReadonlyArray<{ id: string }>
): ToolbarItemDefinition[] {
  const activeIds = new Set(activeItems.map((item) => item.id));
  return ALL_TOOLBAR_ITEM_IDS
    .filter((id) => !activeIds.has(id))
    .map((id) => TOOLBAR_ITEM_DEFINITIONS[id]);
}

/**
 * Create a pinned feed or list toolbar item from a feed object.
 */
export function createPinnedFeedItem(
  feed: Pick<MyFeed, 'type' | 'displayName' | 'uri' | 'avatar'>
): ToolbarItemDefinition {
  const itemType = feed.type === 'list' ? 'pinned_list' : 'pinned_feed';
  return {
    id: `${itemType}:${feed.uri}`,
    type: itemType,
    title: feed.displayName,
    uri: feed.uri,
    ...(feed.avatar ? { avatar: feed.avatar } : {}),
  };
}

/**
 * Create a pinned search toolbar item from a search query.
 */
export function createPinnedSearchItem(query: string, titlePrefix?: string): ToolbarItemDefinition {
  return {
    id: `pinned_search:${query}`,
    type: 'pinned_search',
    title: titlePrefix ? `${titlePrefix}: ${query}` : query,
    query,
  };
}

/**
 * Find the pinned item matching the currently active feed or search state.
 */
export function findActivePinnedItem(
  items: ReadonlyArray<ToolbarItemDefinition>,
  params: {
    activeTab: TabType;
    feedUri?: string;
    searchQuery?: string;
    userDid?: string;
    myDid: string;
  }
): ToolbarItemDefinition | undefined {
  if (params.activeTab === 'feed' && params.feedUri) {
    return items.find(
      (item) =>
        (item.type === 'pinned_feed' || item.type === 'pinned_list') &&
        item.uri === params.feedUri
    );
  }

  if (params.activeTab === 'search' && params.searchQuery) {
    return items.find(
      (item) => item.type === 'pinned_search' && item.query === params.searchQuery
    );
  }

  if (params.activeTab === 'user_posts' && params.userDid === params.myDid) {
    return items.find((item) => item.id === 'my_posts');
  }

  return undefined;
}

/**
 * Move an item with sourceId to the position of targetId and return a new array.
 */
export function reorderToolbarItems<T extends { id: string }>(
  items: ReadonlyArray<T>,
  sourceId: string,
  targetId: string
): T[] | null {
  if (!sourceId || !targetId || sourceId === targetId) return null;

  const fromIndex = items.findIndex((item) => item.id === sourceId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return null;

  const updated = [...items];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  return updated;
}

export function isPinnedToolbarItem(item: { type?: string }): boolean {
  return item && (
    item.type === 'pinned_feed' ||
    item.type === 'pinned_list' ||
    item.type === 'pinned_search'
  );
}

function updatePinnedItemIcon(itemId: string, icon: string) {
  settingsStore.toolbarLeftItems = settingsStore.toolbarLeftItems.map((item) => {
    if (item.id !== itemId) return item;
    if (!icon) {
      const { icon: _removed, ...rest } = item;
      return rest;
    }
    return { ...item, icon };
  });
  settingsStore.saveToolbarLeftItems();
}

export async function handleChangePinnedIcon(item: ToolbarItemDefinition) {
  const selectedIcon = await openIconPickerDialog(
    item.title,
    PINNED_ICON_PRESETS,
    item.icon ?? '',
  );
  if (selectedIcon === null) return;
  updatePinnedItemIcon(item.id, selectedIcon);
}

