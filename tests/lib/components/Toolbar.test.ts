// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { MenuItem } from '@tauri-apps/api/menu';
import Toolbar from '$lib/components/Toolbar.svelte';
import { settingsStore } from '$lib/settingsStore.svelte';
import { feedStore } from '$lib/feedStore.svelte';
import { openIconPickerDialog } from '$lib/customDialogStore.svelte';
import { PINNED_ICON_PRESETS, type ToolbarItemDefinition } from '$lib/toolbarItems';

const DEFAULT_MOCK_ITEMS: Array<Partial<ToolbarItemDefinition> & { id: string }> = [
  { id: 'timeline', type: 'tab', tab: 'timeline', title: 'Timeline' },
  { id: 'mentions', type: 'tab', tab: 'mentions', title: 'Mentions' },
  { id: 'likes', type: 'tab', tab: 'likes', title: 'Likes' },
  { id: 'notifications', type: 'tab', tab: 'notifications', title: 'Notifications' },
  { id: 'bookmarks', type: 'tab', tab: 'bookmarks', title: 'Bookmarks' },
  { id: 'feeds', type: 'feeds', tab: 'feeds', title: 'Feeds' },
];

// Mock external dependencies while keeping real $lib/toolbarItems logic
vi.mock('$lib/settingsStore.svelte', () => ({
  settingsStore: {
    showMediaToggleInToolbar: true,
    alwaysShowRichContent: false,
    toolbarLeftItems: [
      { id: 'timeline', type: 'tab', tab: 'timeline', title: 'Timeline' },
      { id: 'mentions', type: 'tab', tab: 'mentions', title: 'Mentions' },
      { id: 'likes', type: 'tab', tab: 'likes', title: 'Likes' },
      { id: 'notifications', type: 'tab', tab: 'notifications', title: 'Notifications' },
      { id: 'bookmarks', type: 'tab', tab: 'bookmarks', title: 'Bookmarks' },
      { id: 'feeds', type: 'feeds', tab: 'feeds', title: 'Feeds' },
    ],
    saveToolbarLeftItems: vi.fn(),
    toggle: vi.fn(),
  },
}));

vi.mock('$lib/feedStore.svelte', () => ({
  feedStore: {
    target: null as any,
    activeTab: 'timeline',
    searchQuery: '',
    myDid: 'did:plc:example',
  },
}));

vi.mock('$lib/searchHistoryStore.svelte', () => ({
  searchHistoryStore: {
    items: [],
    persist: vi.fn(),
  },
}));

vi.mock('$lib/customDialogStore.svelte', () => ({
  openInputDialog: vi.fn().mockResolvedValue(''),
  openIconPickerDialog: vi.fn().mockResolvedValue(null),
}));

vi.mock('$lib/bsky', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  getMyFeedsAndLists: vi.fn().mockResolvedValue([]),
  atUriToBskyUrl: vi.fn().mockReturnValue(''),
}));

vi.mock('$lib/windowState', () => ({
  setSkipBlurScroll: vi.fn(),
}));

vi.mock('$lib/errorStore.svelte', () => ({
  safely: (fn: () => any) => fn(),
}));

vi.mock('$lib/toast.svelte', () => ({
  toast: {
    show: vi.fn(),
  },
}));

vi.mock('$lib/i18n.svelte', () => ({
  msg: {
    navTimeline: 'Timeline',
    navMentions: 'Mentions',
    navLikes: 'Likes',
    navNotifications: 'Notifications',
    navBookmarks: 'Bookmarks',
    navMyFeeds: 'Feeds',
    navThread: 'Thread',
    navQuotes: 'Quotes',
    navSearch: 'Search',
    navRepeatSearch: 'Repeat Search',
    navMyPosts: 'My Posts',
    navSettings: 'Settings',
    back: 'Back',
    refresh: 'Refresh',
    toolbarCollapseMedia: 'Collapse Media',
    toolbarExpandMedia: 'Expand Media',
    menuAddToToolbar: 'Add to Toolbar',
    menuRemoveThisButton: 'このボタンを削除',
    menuPinThisTab: 'Pin',
    menuChangeIcon: 'Change Icon',
    menuMoreActions: 'More Actions',
  },
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: class {
    constructor(public x: number, public y: number) {}
  },
}));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: vi.fn().mockResolvedValue({
      popup: vi.fn().mockResolvedValue(undefined),
    }),
  },
  MenuItem: {
    new: vi.fn().mockImplementation(async (opts) => opts),
  },
  PredefinedMenuItem: {
    new: vi.fn().mockImplementation(async (opts) => opts),
  },
  Submenu: {
    new: vi.fn().mockImplementation(async (opts) => opts),
  },
}));

describe('Toolbar.svelte', () => {
  const defaultProps = {
    activeTab: 'timeline' as const,
    hasHistory: false,
    onTabChange: vi.fn(),
    onCancel: vi.fn(),
    onGoBack: vi.fn(),
    onSearch: vi.fn(),
    onSelectUser: vi.fn(),
    onSelectFeed: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    feedStore.target = null;
    feedStore.activeTab = 'timeline';
    feedStore.searchQuery = '';
    settingsStore.toolbarLeftItems = DEFAULT_MOCK_ITEMS.map((item) => ({ ...item }));
  });

  it('should render default tabs correctly', () => {
    const { getByTitle } = render(Toolbar, { props: defaultProps });

    expect(getByTitle('Timeline(F1)')).toBeInTheDocument();
    expect(getByTitle('Mentions(F2)')).toBeInTheDocument();
    expect(getByTitle('Likes(F3)')).toBeInTheDocument();
  });

  it('should call onTabChange when a tab is clicked', async () => {
    const onTabChange = vi.fn();
    const { getByTitle } = render(Toolbar, { props: { ...defaultProps, onTabChange } });

    await fireEvent.click(getByTitle('Mentions(F2)'));
    expect(onTabChange).toHaveBeenCalledWith('mentions');
  });

  it('should handle keyboard navigation correctly', () => {
    const onTabChange = vi.fn();
    const { component } = render(Toolbar, { props: { ...defaultProps, onTabChange } });

    const event = new KeyboardEvent('keydown', { key: 'F2' });
    const handled = component.handleKeyNavigation(event);

    expect(handled).toBe(true);
    expect(onTabChange).toHaveBeenCalledWith('mentions');
  });

  it('should reorder items via pointer drag-and-drop and persist order', async () => {
    const { container } = render(Toolbar, { props: defaultProps });
    const wrappers = container.querySelectorAll<HTMLElement>('[data-item-index]');
    const sourceWrapper = wrappers[0];
    const targetWrapper = wrappers[2];

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(targetWrapper);

    try {
      await fireEvent.pointerDown(sourceWrapper, { button: 0, clientX: 10, clientY: 10 });
      await fireEvent.pointerMove(window, { clientX: 120, clientY: 10 });
      await fireEvent.pointerUp(window, { clientX: 120, clientY: 10 });

      expect(settingsStore.toolbarLeftItems.map((i) => i.id)).toEqual([
        'mentions',
        'likes',
        'timeline',
        'notifications',
        'bookmarks',
        'feeds',
      ]);
      expect(settingsStore.saveToolbarLeftItems).toHaveBeenCalledTimes(1);
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('should render pinned feed, list, and search buttons and trigger actions', async () => {
    const onSelectFeed = vi.fn();
    const onSearch = vi.fn();

    settingsStore.toolbarLeftItems = [
      ...DEFAULT_MOCK_ITEMS,
      {
        id: 'pinned_feed:at://did:plc:feed/app.bsky.feed.generator/test',
        type: 'pinned_feed',
        title: 'Test Feed',
        uri: 'at://did:plc:feed/app.bsky.feed.generator/test',
        avatar: 'https://example.com/feed.png',
      },
      {
        id: 'pinned_list:at://did:plc:list/app.bsky.graph.list/mylist',
        type: 'pinned_list',
        title: 'My List',
        uri: 'at://did:plc:list/app.bsky.graph.list/mylist',
      },
      {
        id: 'pinned_search:svelte',
        type: 'pinned_search',
        title: 'Search: svelte',
        query: 'svelte',
      },
    ];

    const { getByTitle } = render(Toolbar, {
      props: { ...defaultProps, onSelectFeed, onSearch },
    });

    await fireEvent.click(getByTitle(/^Test Feed/));
    expect(onSelectFeed).toHaveBeenCalledWith({
      type: 'feed',
      displayName: 'Test Feed',
      uri: 'at://did:plc:feed/app.bsky.feed.generator/test',
      avatar: 'https://example.com/feed.png',
    });

    await fireEvent.click(getByTitle(/^My List/));
    expect(onSelectFeed).toHaveBeenCalledWith({
      type: 'list',
      displayName: 'My List',
      uri: 'at://did:plc:list/app.bsky.graph.list/mylist',
      avatar: undefined,
    });

    await fireEvent.click(getByTitle(/^Search: svelte/));
    expect(onSearch).toHaveBeenCalledWith('svelte');
  });

  it('should render custom preset icon on a pinned item when icon is set', () => {
    const pinnedId = 'pinned_feed:at://did:plc:feed/app.bsky.feed.generator/custom';
    settingsStore.toolbarLeftItems = [
      ...DEFAULT_MOCK_ITEMS,
      {
        id: pinnedId,
        type: 'pinned_feed',
        title: 'Custom Icon Feed',
        uri: 'at://did:plc:feed/app.bsky.feed.generator/custom',
        avatar: 'https://example.com/feed.png',
        icon: 'icon-bookmark',
      },
    ];

    const { container, getByTitle } = render(Toolbar, { props: defaultProps });
    const button = getByTitle(/^Custom Icon Feed/);

    expect(button.querySelector('.icon-bookmark')).toBeInTheDocument();
    expect(container.querySelector(`img[src="https://example.com/feed.png"]`)).toBeNull();
  });

  it('should hide temporary feed tab when the opened feed is already pinned', () => {
    const uri = 'at://did:plc:feed/app.bsky.feed.generator/pinned';
    settingsStore.toolbarLeftItems = [
      ...DEFAULT_MOCK_ITEMS,
      {
        id: `pinned_feed:${uri}`,
        type: 'pinned_feed',
        title: 'Pinned Feed',
        uri,
      },
    ];
    feedStore.target = {
      feed: {
        type: 'feed',
        displayName: 'Pinned Feed',
        uri,
      },
    };

    const { container, getByTitle } = render(Toolbar, {
      props: { ...defaultProps, activeTab: 'feed' },
    });

    expect(container.querySelector('[data-item-id="feed_tab"]')).toBeNull();
    expect(getByTitle(/^Pinned Feed/)).toHaveClass('active');
  });

  it('should pin a temporary feed tab from context menu', async () => {
    const uri = 'at://did:plc:feed/app.bsky.feed.generator/temp';
    feedStore.target = {
      feed: {
        type: 'feed',
        displayName: 'Temp Feed',
        uri,
        avatar: 'https://example.com/temp.png',
      },
    };

    const { container } = render(Toolbar, {
      props: { ...defaultProps, activeTab: 'feed' },
    });

    const feedTab = container.querySelector<HTMLElement>('[data-item-id="feed_tab"]')!;
    expect(feedTab).toBeInTheDocument();

    await fireEvent.contextMenu(feedTab);

    const pinMenuCalls = vi.mocked(MenuItem.new).mock.calls;
    const pinCall = pinMenuCalls.find(([opts]) => opts.id === `pin_item_pinned_feed:${uri}`);
    expect(pinCall).toBeDefined();

    await pinCall![0].action?.();

    expect(settingsStore.toolbarLeftItems.some((item) => item.id === `pinned_feed:${uri}`)).toBe(true);
    expect(settingsStore.saveToolbarLeftItems).toHaveBeenCalledTimes(1);
  });

  it('should change and reset a pinned item icon from context menu', async () => {
    const pinnedId = 'pinned_list:at://did:plc:list/app.bsky.graph.list/mylist';
    settingsStore.toolbarLeftItems = [
      ...DEFAULT_MOCK_ITEMS,
      {
        id: pinnedId,
        type: 'pinned_list',
        title: 'My List',
        uri: 'at://did:plc:list/app.bsky.graph.list/mylist',
      },
    ];

    vi.mocked(openIconPickerDialog).mockResolvedValueOnce('icon-like');

    const { container } = render(Toolbar, { props: defaultProps });
    const pinnedEl = container.querySelector<HTMLElement>(`[data-item-id="${pinnedId}"]`)!;
    expect(pinnedEl).toBeInTheDocument();

    await fireEvent.contextMenu(pinnedEl);

    const changeIconCall = vi
      .mocked(MenuItem.new)
      .mock.calls.find(([opts]) => opts.id === `change_icon`);
    expect(changeIconCall).toBeDefined();

    await changeIconCall![0].action?.();

    expect(openIconPickerDialog).toHaveBeenCalledWith('My List', PINNED_ICON_PRESETS, '');
    expect(settingsStore.toolbarLeftItems.find((i) => i.id === pinnedId)?.icon).toBe('icon-like');
    expect(settingsStore.saveToolbarLeftItems).toHaveBeenCalledTimes(1);

    // Reset back to default when empty string is returned
    vi.mocked(openIconPickerDialog).mockResolvedValueOnce('');
    await changeIconCall![0].action?.();

    expect(settingsStore.toolbarLeftItems.find((i) => i.id === pinnedId)?.icon).toBeUndefined();
    expect(settingsStore.saveToolbarLeftItems).toHaveBeenCalledTimes(2);
  });
});
