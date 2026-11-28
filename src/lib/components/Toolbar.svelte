<script lang="ts">
  import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
  import { LogicalPosition } from '@tauri-apps/api/dpi';
  import { slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { settingsStore } from '$lib/settingsStore.svelte';
  import { searchHistoryStore } from '$lib/searchHistoryStore.svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { openInputDialog } from '$lib/customDialogStore.svelte';
  import { feedStore, type Author, type TabType } from '$lib/feedStore.svelte';
  import { getProfile, getMyFeedsAndLists, atUriToBskyUrl, type MyFeed } from '$lib/bsky';
  import { setSkipBlurScroll } from '$lib/windowState';
  import { msg } from '$lib/i18n.svelte';
  import {
    TOOLBAR_ITEM_DEFINITIONS,
    getHiddenToolbarItems,
    createPinnedFeedItem,
    createPinnedSearchItem,
    findActivePinnedItem,
    reorderToolbarItems,
    isPinnedToolbarItem,
    handleChangePinnedIcon,
    type ToolbarItemDefinition,
  } from '$lib/toolbarItems';

  let {
    activeTab = 'timeline',
    hasHistory = false,
    onTabChange,
    onCancel,
    onGoBack,
    onSearch,
    onSelectUser,
    onSelectFeed,
  }: {
    activeTab: TabType;
    hasHistory: boolean;
    onTabChange: (tab: TabType) => void;
    onCancel: () => void;
    onGoBack: () => void;
    onSearch: (item: string) => void;
    onSelectUser: (author?: Author) => void;
    onSelectFeed: (item: MyFeed) => void;
  } = $props();

  let toolbarLeft = $state<HTMLSectionElement | null>(null);
  let profileCache: Author | null = null;
  let lastSearchQuery = $state('');
  let myFeeds: MyFeed[] | undefined = undefined;
  let isMyFeedsLoading = $state(false);

  let feedTarget = $derived(feedStore.target);
  let currentQuery = $derived(activeTab === 'search' ? feedTarget?.key : undefined);
  let selectedUser = $derived(feedTarget?.author);
  let selectedFeed = $derived(feedTarget?.feed);

  let currentPinned = $derived(
    findActivePinnedItem(settingsStore.toolbarLeftItems, {
      activeTab,
      feedUri: selectedFeed?.uri,
      searchQuery: currentQuery,
      userDid: selectedUser?.did,
      myDid: feedStore.myDid,
    })
  );

  let temporaryMenuTab = $state<ToolbarItemDefinition | null>(null);

  let temporaryTab = $derived([
    ...(
      currentPinned ? [] :
      activeTab === 'user_posts' && selectedUser ? [{ id: 'user', type: 'user', hasBack: true }] :
      activeTab === 'thread' ? [{ id: 'thread_tab', type: 'thread_tab', hasBack: true }] :
      activeTab === 'quotes' ? [{ id: 'quotes_tab', type: 'quotes_tab', hasBack: true }] :
      activeTab === 'search' ? [{ id: 'search_tab', type: 'search_tab', hasBack: true }] :
      activeTab === 'feed' && selectedFeed ? [{ id: 'feed_tab', type: 'feed_tab', hasBack: true }] :
      temporaryMenuTab ? [temporaryMenuTab] : []
    ),
  ]);

  let leftItems = $derived([
    ...temporaryTab,
    ...settingsStore.toolbarLeftItems.map(
      (item) => TOOLBAR_ITEM_DEFINITIONS[item.id] || item
    ),
  ]);

  async function handleOpenUserProfile() {
    const path = selectedUser?.handle || selectedUser?.did;
    if (path) {
      setSkipBlurScroll();
      await openUrl(`https://bsky.app/profile/${path}`);
    }
  }

  export function navigateTab(direction: number) {
    let next = toolbarLeft.querySelector('.toolbar-item-wrapper:has(.active)');
    for (let i = 0; i < leftItems.length; i ++) {
      next = direction < 0 ? next?.previousElementSibling : next?.nextElementSibling;
      if (!next) {
        next = toolbarLeft.querySelector(`.toolbar-item-wrapper:${direction < 0 ? 'last' : 'first'}-of-type`)
      }
      const id = next?.getAttribute('data-item-id');
      if (id && !['feeds', 'search', 'repeat_search'].includes(id)) {
        const btn = next?.getElementsByClassName('tool-btn')?.[0];
        btn?.scrollIntoView({ behavior: 'smooth' });
        btn?.click();
        break;
      }
    }
  }

  export function handleKeyNavigation(e: KeyboardEvent): boolean {
    const matched = e.key.match(/^F([0-9]+)$/);
    if (matched?.[1] && !e.altKey) {
      const btn = document.querySelector(`[data-key=${e.key}]`) as HTMLElement | null;
      if (btn) {
        e.preventDefault();
        btn.scrollIntoView({ behavior: 'smooth' });
        btn.click();
        return true;
      }
    }

    if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      navigateTab(e.shiftKey ? -1 : 1);
      return true;
    }

    return false;
  }

  async function search(defaultQuery: string) {
    const query = await openInputDialog(
      msg.navSearch,
      defaultQuery,
      searchHistoryStore.items,
      '',
    );
    searchHistoryStore.persist();
    if (query) {
      lastSearchQuery = query;
      onSearch(query);
    }
  }

  async function openMyPosts() {
    if (!profileCache) {
      profileCache = await getProfile(feedStore.myDid);
    }
    onSelectUser(profileCache);
  }

  async function triggerToolbarAction(item: ToolbarItemDefinition) {
    switch (item.type) {
      case 'tab': {
        const isAlreadyInLeft = settingsStore.toolbarLeftItems.some((active) => active.id === item.id);
        if (!isAlreadyInLeft) {
          temporaryMenuTab = item;
        }
        if (item.tab) {
          handleSelectTab(item.tab);
        }
        break;
      }
      case 'search':
        await search('');
        break;
      case 'repeat_search':
        if (lastSearchQuery) {
          onSearch(lastSearchQuery);
        } else {
          await search('');
        }
        break;
      case 'my_posts':
        await openMyPosts();
        break;
      case 'pinned_feed':
        if (item.uri) {
          onSelectFeed({
            type: 'feed',
            displayName: item.title,
            uri: item.uri,
            avatar: item.avatar,
          });
        }
        break;
      case 'pinned_list':
        if (item.uri) {
          onSelectFeed({
            type: 'list',
            displayName: item.title,
            uri: item.uri,
            avatar: item.avatar,
          });
        }
        break;
      case 'pinned_search': {
        const query = item.query;
        if (query) {
          lastSearchQuery = query;
          onSearch(query);
        }
        break;
      }
    }
  }

  function addToolbarItem(id: string) {
    const current = settingsStore.toolbarLeftItems;
    if (current.some((item) => item.id === id)) return;
    settingsStore.toolbarLeftItems = [...current, {
      id,
      type: TOOLBAR_ITEM_DEFINITIONS[id]?.type ?? 'tab',
      title: TOOLBAR_ITEM_DEFINITIONS[id]?.title ?? id,
    }];
    settingsStore.saveToolbarLeftItems();
  }

  function removeToolbarItem(id: string) {
    const current = settingsStore.toolbarLeftItems;
    if (current.length <= 1) return;
    settingsStore.toolbarLeftItems = current.filter((item) => item.id !== id);
    settingsStore.saveToolbarLeftItems();
  }

  function getTargetCustomizableItemId(e: MouseEvent): string | null {
    const target = e.target as HTMLElement | null;
    const itemId = target?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
    if (!itemId) return null;

    const isConfigurable = settingsStore.toolbarLeftItems.some((item) => item.id === itemId);
    return isConfigurable ? itemId : null;
  }

  async function popupBelow(menu: Menu, target: HTMLElement | null) {
    if (target) {
      const rect = target.getBoundingClientRect();
      await menu.popup(new LogicalPosition(rect.left, rect.bottom));
    } else {
      await menu.popup();
    }
  }

  function viewOnWebSelectedFeed() {
    if (!selectedFeed?.uri) return;
    const url = atUriToBskyUrl(selectedFeed.uri);
    if (url) {
      openUrl(url);
    }
  }

  function handleSelectTab(tab: TabType) {
    if (temporaryMenuTab && temporaryMenuTab.tab !== tab) {
      temporaryMenuTab = null;
    }
    onTabChange(tab);
  }

  async function handleMyFeeds(e?: MouseEvent) {
    const menuItems = [];
    if (!myFeeds) {
      isMyFeedsLoading = true;
      myFeeds = await getMyFeedsAndLists();
      isMyFeedsLoading = false;
    }
    for (const f of myFeeds) {
      menuItems.push(await MenuItem.new({
        text: f.displayName,
        action: () => {
          onSelectFeed(f);
          toolbarLeft?.scrollTo({ left: 0, behavior: 'smooth' });
        },
      }));
    }
    menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    menuItems.push(await MenuItem.new({
      text: msg.refresh,
      action: () => {
        myFeeds = undefined;
        handleMyFeeds(e);
      },
    }));
    const menu = await Menu.new({ items: menuItems });
    await popupBelow(menu, (e?.target as HTMLElement) ?? null);
  }

  async function buildHiddenItemMenuEntry(item: ToolbarItemDefinition, e?: MouseEvent) {
    if (item.type === 'repeat_search' && !lastSearchQuery) {
      return null;
    }

    return MenuItem.new({
      id: item.id,
      text: item.title,
      action: async () => {
        if (item.type === 'feeds') {
          await handleMyFeeds(e);
          return;
        }
        await triggerToolbarAction(item);
      },
    });
  }

  async function buildAddItemSubmenu(hiddenItems: ToolbarItemDefinition[]) {
    const addableItems = hiddenItems.filter(
      (item) => !settingsStore.toolbarLeftItems.some((active) => active.id === item.id)
    );
    if (addableItems.length === 0) return null;

    const subMenuItems = await Promise.all(
      addableItems.map((item) =>
        MenuItem.new({
          id: `add_toolbar_${item.id}`,
          text: item.title,
          action: () => {
            addToolbarItem(item.id);
          },
        })
      )
    );

    return Submenu.new({
      text: msg.menuAddToToolbar,
      items: subMenuItems,
    });
  }

  function createPinnedItemFromTemporary(e: MouseEvent): ToolbarItemDefinition | null {
    const target = e.target as HTMLElement | null;
    const itemId = target?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;

    if (itemId === 'feed_tab' && selectedFeed) {
      return createPinnedFeedItem(selectedFeed);
    }

    if (itemId === 'search_tab' && currentQuery) {
      return createPinnedSearchItem(currentQuery, msg.navSearch);
    }

    return null;
  }

  function pinTemporaryItem(candidate: ToolbarItemDefinition) {
    const current = settingsStore.toolbarLeftItems;
    if (current.some((item) => item.id === candidate.id)) return;
    settingsStore.toolbarLeftItems = [...current, candidate];
    settingsStore.saveToolbarLeftItems();
  }

  async function showContextMenu(e: MouseEvent) {
    const menuItems = [];

    const pinnableItem = createPinnedItemFromTemporary(e);
    if (pinnableItem) {
      const alreadyPinned = settingsStore.toolbarLeftItems.some(
        (item) => item.id === pinnableItem.id
      );
      menuItems.push(
        await MenuItem.new({
          id: `pin_item_${pinnableItem.id}`,
          text: msg.menuPinThisTab,
          enabled: !alreadyPinned,
          action: () => {
            pinTemporaryItem(pinnableItem);
          },
        })
      );
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    }

    const clickedItemId = (e.target as HTMLElement | null)
      ?.closest<HTMLElement>('[data-item-id]')
      ?.dataset.itemId;
    const item = clickedItemId
      ? leftItems.find((toolbarItem) => toolbarItem.id === clickedItemId)
      : undefined;

    if (isPinnedToolbarItem(item)) {
      menuItems.push(
        await MenuItem.new({
          id: `change_icon`,
          text: msg.menuChangeIcon,
          action: async () => {
            await handleChangePinnedIcon(item);
          },
        })
      );
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    }

    const hiddenItems = getHiddenToolbarItems(leftItems);

    for (const item of hiddenItems) {
      const entry = await buildHiddenItemMenuEntry(item, e);
      if (entry) {
        menuItems.push(entry);
      }
    }

    if (menuItems.length) {
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    }
    const addSubmenu = await buildAddItemSubmenu(hiddenItems);
    if (addSubmenu) {
      menuItems.push(addSubmenu);
    }

    const targetItemId = getTargetCustomizableItemId(e);
    if (targetItemId) {
      const canRemove = settingsStore.toolbarLeftItems.length > 1;
      menuItems.push(await MenuItem.new({
        id: `remove_toolbar`,
        text: msg.menuRemoveThisButton,
        enabled: canRemove,
        action: () => {
          removeToolbarItem(targetItemId);
        },
      }));
    }

    menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    menuItems.push(await MenuItem.new({
      id: 'settings',
      text: msg.navSettings,
      action: () => { handleSelectTab('settings'); },
    }));

    const menu = await Menu.new({ items: menuItems });
    await popupBelow(menu, (e?.target as HTMLElement) ?? null);
  }

  // Pointer-based drag-and-drop state for reordering toolbar items
  const DRAG_THRESHOLD_PX = 6;
  let pointerDraggingIndex = $state<number | null>(null);
  let pointerDropIndex = $state<number | null>(null);
  let suppressClickOnce = false;

  function reorderLeftItemsById(sourceId: string, targetId: string) {
    const updated = reorderToolbarItems(settingsStore.toolbarLeftItems, sourceId, targetId);
    if (!updated) return;
    settingsStore.toolbarLeftItems = updated;
    settingsStore.saveToolbarLeftItems();
  }

  function handleItemPointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;
    let currentDropIndex: number | null = null;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!isDragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        isDragging = true;
        pointerDraggingIndex = index;
      }
      if (!isDragging) return;

      const targetEl = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>('[data-item-index]');

      if (targetEl) {
        const idx = Number(targetEl.dataset.itemIndex);
        if (!Number.isNaN(idx) && idx !== index) {
          currentDropIndex = idx;
          pointerDropIndex = idx;
        }
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (isDragging) {
        suppressClickOnce = true;
        setTimeout(() => {
          suppressClickOnce = false;
        }, 0);

        if (currentDropIndex !== null && currentDropIndex !== index) {
          const sourceItem = leftItems[index];
          const targetItem = leftItems[currentDropIndex];
          if (sourceItem && targetItem) {
            reorderLeftItemsById(sourceItem.id, targetItem.id);
          }
        }
      }

      isDragging = false;
      currentDropIndex = null;
      pointerDraggingIndex = null;
      pointerDropIndex = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function handleCaptureClick(e: MouseEvent) {
    if (suppressClickOnce) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickOnce = false;
    }
  }
</script>

<header class="toolbar" oncontextmenu={(e) => { showContextMenu(e); }}>
  <div class="scroll-left" onpointerenter={() => {
    toolbarLeft?.scrollBy({ left: -toolbarLeft.clientWidth, behavior: 'smooth' });
  }}></div>
  <div
    bind:this={toolbarLeft}
    class="toolbar-left"
    onclickcapture={handleCaptureClick}
  >
    {#each leftItems as item, index (item.id)}
      {@const key = index < 12 ? `F${index + 1}` : ''}
      {@const keyLabel = key ? `(${key})` : ''}
      <div
        animate:flip={{ duration: 250 }}
        transition:slide={{ axis: 'x', duration: 250 }}
        class="toolbar-item-wrapper"
        class:is-dragging={pointerDraggingIndex === index}
        class:is-drag-over-left={pointerDropIndex === index && pointerDraggingIndex !== null && index < pointerDraggingIndex}
        class:is-drag-over-right={pointerDropIndex === index && pointerDraggingIndex !== null && index > pointerDraggingIndex}
        data-item-index={index}
        data-item-id={item.id}
        onpointerdown={(e) => handleItemPointerDown(e, index)}
      >
        {#if item.type === 'user' && selectedUser}
          <button
            type="button"
            class="user-profile-tab active"
            title="{selectedUser.displayName || selectedUser.handle} (@{selectedUser.handle})"
            onclick={handleOpenUserProfile}
          >
            {#if selectedUser.avatar}
              <img src={selectedUser.avatar} alt="avatar" class="toolbar-user-avatar" />
            {:else}
              <div class="toolbar-avatar-placeholder"></div>
            {/if}
            <span class="toolbar-label">{selectedUser.displayName || selectedUser.handle}</span>
          </button>
        {:else if item.type === 'thread_tab'}
          <button
            type="button"
            class="thread-tab active"
            onclick={(e) => e.preventDefault()}
            title={msg.navThread}
          >
            <span class="icon-base icon-thread"></span>
            <span class="toolbar-label">{msg.navThread}</span>
          </button>
        {:else if item.type === 'quotes_tab'}
          <button
            type="button"
            class="quotes-tab active"
            onclick={(e) => e.preventDefault()}
            title={msg.navQuotes}
          >
            <span class="icon-base icon-quote"></span>
            <span class="toolbar-label">{msg.navQuotes}</span>
          </button>
        {:else if item.type === 'search_tab'}
          <button
            type="button"
            class="tool-btn active"
            onclick={() => { search(feedStore.target?.key ?? ''); }}
            title={msg.navSearch}
          >
            <span class="icon-base icon-search"></span>
            <span class="toolbar-label">{feedTarget?.key}</span>
          </button>
        {:else if item.type === 'feed_tab' && selectedFeed}
          <button
            type="button"
            class="feed-tab active"
            title={selectedFeed.displayName}
            onclick={viewOnWebSelectedFeed}
          >
            {#if selectedFeed.avatar}
              <img class="feed-icon" src={selectedFeed.avatar} alt="" />
            {:else}
              <span class="icon-base icon-feed"></span>
            {/if}
            <span class="toolbar-label">{selectedFeed.displayName}</span>
          </button>
        {:else if item.type === 'feeds'}
          <button
            type="button"
            class="tool-btn"
            class:active={activeTab === item.tab}
            class:loading={isMyFeedsLoading}
            onclick={handleMyFeeds}
            title="{(activeTab === item.tab && item.sub) || item.title}{keyLabel}"
            data-key={key}
          >
            <span
              class="icon-base no-active"
              class:icon-feed={!isMyFeedsLoading}
              class:icon-coin={isMyFeedsLoading}
              class:coin-spin={isMyFeedsLoading}
            ></span>
          </button>
        {:else}
          <button
            type="button"
            class="tool-btn"
            class:active={item.id === currentPinned?.id || activeTab === item.tab}
            onclick={() => triggerToolbarAction(item)}
            title="{item.title}{keyLabel}"
            data-key={key}
          >
            {#if item.icon}
              <span class="icon-base {item.icon} no-active"></span>
            {:else if item.avatar}
              <img class="feed-icon" src={item.avatar} alt="" />
            {:else if item.type === 'tab'}
              <span class="icon-base icon-{item.id} no-active"></span>
            {:else}
              <span class="icon-base icon-{item.type} no-active"></span>
            {/if}
          </button>
        {/if}

        {#if item.hasBack && hasHistory}
          <button
            type="button"
            class="tool-btn back-btn"
            title={msg.back}
            onclick={onGoBack}
          >
            <span class="icon-base icon-back no-active"></span>
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="toolbar-right">
    <div class="scroll-right" onpointerenter={() => {
      toolbarLeft?.scrollBy({ left: toolbarLeft.clientWidth, behavior: 'smooth' });
    }}></div>
    {#if settingsStore.showMediaToggleInToolbar && feedStore.activeTab === 'timeline'}
      <button
        type="button"
        class="tool-btn"
        class:disabled={activeTab !== 'timeline' && activeTab !== 'mentions'}
        onclick={() => settingsStore.toggle('alwaysShowRichContent')}
        title={settingsStore.alwaysShowRichContent ? msg.toolbarCollapseMedia : msg.toolbarExpandMedia}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="icon-base media-toggle-icon"
          class:expanded={settingsStore.alwaysShowRichContent}
        >
          <path class="line-top" d="M4 10h16" />
          <path class="line-bottom" d="M4 15h16" />
          <path class="inner-top" d="M8 10l4-4 4 4m-4-4v 8" />
          <path class="inner-bottom" d="M8 15l4 4 4-4m-4 4v-8" />
          <path class="outer-top" d="M8 4l4 4 4-4m-4 4v-8" />
          <path class="outer-bottom" d="M8 20l4-4 4 4m-4-4v8" />
        </svg>
      </button>
    {/if}
    <button
      type="button"
      class="tool-btn"
      title={msg.menuMoreActions}
      onclick={showContextMenu}
    >
      <span class="icon-base icon-more"></span>
    </button>
  </div>
</header>

<style>
  /* Keep existing styles from the previous step */
  .toolbar {
    --icon-size: 16px;
    --pad: var(--sp-md);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--pad);
    border-bottom: 1px solid var(--border-color);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    min-width: 0;
  }

  .scroll-left,
  .scroll-right {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 12px;
  }

  .toolbar-item-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    overflow: hidden;
    max-height: calc(var(--icon-size) + var(--pad) * 2);
    user-select: none;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    position: relative;
  }

  .tool-btn {
    border: none;
    padding: var(--sp-md);
    border-radius: var(--rad-lg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: var(--tranc-bc);
    flex-shrink: 0;
  }

  .tool-btn .icon-base {
    width: var(--icon-size) !important;
    height: var(--icon-size) !important;
  }

  .tool-btn .icon-likes {
    width: calc(var(--icon-size) * 0.92) !important;
  }

  .tool-btn:hover:not(.loading), .tool-btn:focus:not(.loading) {
    background-color: var(--bg-gray-hover) !important;
    color: var(--text-main);
  }

  .tool-btn.disabled {
    opacity: .4;
    pointer-events: none;
    cursor: default;
  }

  .user-profile-tab,
  .thread-tab,
  .quotes-tab,
  .feed-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background-color: var(--bg-btn-hover);
    color: var(--accent-color);
    border-radius: 8px;
    font-weight: 500;
    min-width: 30px;
    max-width: calc(100vw - 140px);
    height: 28px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    justify-content: center;
  }

  .user-profile-tab {
    cursor: pointer;
  }

  .icon-thread,
  .quotes-tab {
    margin-top: 2px;
  }

  .feed-icon {
    max-width: 1em;
    max-height: 1em;
    border-radius: 0.3em;
    pointer-events: none;
  }

  .toolbar-user-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .toolbar-label {
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .media-toggle-icon {
    background: unset;
    & > path {
      transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .inner-top {
      opacity: 0;
      transform: translateY(6px);
    }
    .inner-bottom {
      opacity: 0;
      transform: translateY(-6px);
    }
  }

  .media-toggle-icon.expanded {
    .inner-top {
      opacity: 1;
      transform: translateY(0);
    }
    .inner-bottom {
      opacity: 1;
      transform: translateY(0);
    }
    .outer-top {
      opacity: 0;
      transform: translateY(-6px);
    }
    .outer-bottom {
      opacity: 0;
      transform: translateY(6px);
    }
    .line-top {
      transform: translateY(-6px);
    }
    .line-bottom {
      transform: translateY(6px);
    }
  }

  .is-dragging {
    opacity: 0.4;
  }

  .is-drag-over-left {
    border-left: 2px solid var(--accent-color);
    margin-left: -2px;
  }

  .is-drag-over-right {
    border-right: 2px solid var(--accent-color);
    margin-right: -2px;
  }
</style>
