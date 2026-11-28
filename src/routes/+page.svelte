<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from "svelte";
  import { setContext } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';
  import { dialog } from '$lib/dialog.svelte';
  import { restoreSession, login, logout, agent, type PostRef, type MyFeed } from "$lib/bsky";
  import { settingsStore } from '$lib/settingsStore.svelte';
  import { searchHistoryStore } from '$lib/searchHistoryStore.svelte';
  import {
    feedStore,
    type TabType,
    type Author,
    type ReplyInfo,
    type Target,
    type FeedHistoryEntry,
  } from "$lib/feedStore.svelte";
  import { toast } from '$lib/toast.svelte';
  import { safely } from '$lib/errorStore.svelte';
  import { updateWindowIcon, resetIcon } from '$lib/windowIcon';
  import { msg, i18n } from '$lib/i18n.svelte';
  import { getAndResetSkipBlurScroll } from '$lib/windowState';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import LoginForm from '$lib/components/LoginForm.svelte';
  import Timeline from '$lib/components/Timeline.svelte';
  import Notifications from '$lib/components/Notifications.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import ComposeBox from '$lib/components/ComposeBox.svelte';
  import SettingsView from '$lib/components/SettingsView.svelte';
  import ScrollBar from '$lib/components/ScrollBar.svelte';
  import { POST_ACTION_OPTIONS_KEY, type PostActionOptions } from '$lib/postactions';
  import type { ComposeTarget, TargetReplyType } from '$lib/components/ComposeBox.svelte';
  import {
    getStoredAccount,
    getStoredAccounts,
    saveOrUpdateAccount,
    type StoredAccount
  } from '$lib/auth';

  let storedAccounts = $state<StoredAccount[]>(getStoredAccounts());
  let handle = $state("");
  let password = $state("");
  let rememberPassword = $state(false);
  let isLoggedIn = $state(false);
  let isLoading = $state(true);
  let myDid = $state("");
  let isSkipAnimation = $state(false);

  let headerSection = $state<HTMLSectionElement | null>(null);
  let feedSection = $state<HTMLSectionElement | null>(null);
  let toolbarComp = $state<Toolbar | null>(null);
  let composeBoxComp = $state<ComposeBox | null>(null);
  let timelineComp = $state<Timeline | null>(null);
  let scrollBarComp = $state<ScrollBar | null>(null);

  let composeTarget = $state<ComposeTarget | null>(null);
  let tags: string[] = $state([]);

  let isWindowFocused = $state(true);
  let blurTimer = 0;
  let isDraggingOver = $state(false);

  type HistoryItem = {
    feedHistoryEntry: FeedHistoryEntry;
    scrollTop?: number;
    composeTarget: ComposeTarget | null;
  };

  let navigationHistory = $state<HistoryItem[]>([]);
  let isNavigatingBack = $state(false);

  onMount(async () => {
    const savedHandle = localStorage.getItem('bsky_handle');
    if (savedHandle) {
      handle = savedHandle;
    }

    const savedPassword = localStorage.getItem('bsky_password');
    if (savedPassword) {
      password = savedPassword;
      rememberPassword = true;
    }

    let success = await restoreSession();

    if (!success && savedHandle && savedPassword) {
      try {
        await login(savedHandle, savedPassword);
        success = true;
      } catch (err) {
        console.info("Auto-login failed:", err);
      }
    }

    if (success) {
      onLoginSuccess();
      handle = agent.handle || savedHandle;
      password = savedPassword;
      saveOrUpdateAccount(handle, password, agent.session, rememberPassword);
    }

    isLoading = false;

    window.addEventListener('keydown', handleKeyDown);

    const unlistenEventFocus = await listen('event-focus', async () => {
      clearTimeout(blurTimer);
      handleWindowFocused();
    });

    const unlistenEventBlur = await listen('event-blur', async () => {
      clearTimeout(blurTimer);
      if (!dialog.isOpen) {
        blurTimer = setTimeout(handleWindowBlur, 100);
      }
    });

    const unlistenActivated = await listen('shortcut-activated', async () => {
      if (feedStore.activeTab === 'settings') {
        await handleTabChange('timeline');
      }
      setTimeout(() => {
        composeBoxComp?.focusTextarea();
      }, 300);
    });

    syncTrayMenu();

    composeBoxComp?.focusTextarea();

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const height = entry.target.offsetHeight;
        document.documentElement.style.setProperty('--header-height', `${height}px`);
      }
    });
    if (headerSection) {
      observer.observe(headerSection);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unlistenEventFocus();
      unlistenEventBlur();
      unlistenActivated();
      feedStore.stopPolling();
      observer.disconnect();
    };
  });

  async function onLoginSuccess() {
    isLoggedIn = true;
    myDid = agent?.session?.did || "";
    handle = agent?.session?.handle || handle;
    storedAccounts = getStoredAccounts();
    feedStore.init(myDid, handleNewMention);
    feedStore.loadInitialData();
    feedStore.startPolling();
  }

  async function handleLogin(e: SubmitEvent) {
    e?.preventDefault();
    if (!handle || !password) return;

    feedStore.isFeedLoading = true;
    await safely(async () => {
      await login(handle, password);
      onLoginSuccess();
      localStorage.setItem('bsky_handle', handle);
      if (rememberPassword) {
        localStorage.setItem('bsky_password', password);
      } else {
        localStorage.removeItem('bsky_password');
      }
      saveOrUpdateAccount(handle, password, agent.session, rememberPassword);
    });
    feedStore.isFeedLoading = false;

    if (feedStore.activeTab !== 'timeline') {
      handleTabChange('timeline');
    }
  }

  function handleLogout() {
    logout();
    isLoggedIn = false;
    if (!rememberPassword) {
      password = "";
    }
    myDid = "";
    feedStore.stopPolling();
  }

  async function switchAccount(targetHandle: string) {
    const account = getStoredAccount(targetHandle);
    if (!account) {
      toast.showError(`Failed to switch account: ${targetHandle}`);
      return;
    }

    feedStore.stopPolling();
    logout(); // Clear current session

    handle = account.handle;
    password = account.password || "";
    rememberPassword = !!account.password;

    feedStore.isFeedLoading = true;
    await safely(async () => {
      let success = false;

      // 1. Try restoring session using account-specific stored session data
      if (account.session) {
        success = await restoreSession(account.session);
      }

      // 2. Fallback to login with password if session restoration fails
      if (!success && password) {
        const sessionData = await login(handle, password);
        success = true;
        saveOrUpdateAccount(handle, password, sessionData, rememberPassword);
      }

      success = success && agent?.session?.handle === targetHandle;

      if (success) {
        onLoginSuccess();
        await feedStore.switchTab('timeline');
      } else {
        handleLogout();
        throw new Error("Failed to switch account: Re-authentication required");
      }
    });
    feedStore.isFeedLoading = false;
  }

  async function handleTabChange(tab: TabType) {
    handleClearHistory();
    composeTarget = null;
    composeBoxComp?.focusTextarea();
    if (tab === feedStore.activeTab) {
      if (tab === 'timeline') {
        scrollToTop();
      } else {
        feedStore.resetCurrentPosts(tab);
        feedStore.switchTab(tab);
      }
    } else {
      feedSection?.scrollTo({ top: 0, behavior: 'instant' });
      await feedStore.switchTab(tab);
    }
    if (tab ==='mentions') {
      const latestItem = feedSection?.getElementsByClassName('is-latest-in-thread')[0];
      latestItem?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }

  async function handleSelectUser(actor: Author) {
    pushHistory();
    await feedStore.selectUser(actor);
    if (!isNavigatingBack) {
      feedSection.scrollTo(0, 0);
    }
    handleSelectReply({ actor }, 'user_reply');
  }

  async function handleViewQuotes(item: FeedItem) {
    pushHistory();
    handleSelectReply(item, 'quote');
    await feedStore.viewQuotes(item);
  }

  async function handleOpenThread(item: FeedItem) {
    pushHistory();
    handleSelectReply(item, 'reply');
    await feedStore.openThread(item);
    console.log(item)
  }

  async function handleSearch(query: string) {
    pushHistory();
    composeTarget = null;
    await feedStore.search(query);
    if (!isNavigatingBack) {
      feedSection.scrollTo(0, 0);
    }
    searchHistoryStore.addQuery(query);
  }

  async function handleSelectFeed(feed: MyFeed) {
    pushHistory();
    composeTarget = null;
    await feedStore.feed(feed);
    if (!isNavigatingBack) {
      feedSection.scrollTo(0, 0);
    }
  }

  function handleAddTag(tag: string) {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  function handleRemoveTag(tag: string) {
    tags = tags.filter(t => t !== tag);
  }

  async function handlePostSuccess(myPost: PostRef) {
    if (feedStore.activeTab === 'search' && tags.contains(feedStore.searchQuery)) {
      // Keep search tab.
    } else {
      await handleTabChange('timeline');
    }
    requestAnimationFrame(() => {
      composeBoxComp?.focusTextarea();
    });
    const isSuccessFetch = await feedStore.fetchAndAddMyLatestPost(myDid, myPost);
    if (!isSuccessFetch) {
      toast.show(msg.toastPostReflectDelayed, 'success');
    }
  }

  async function handleSelectLatestReply() {
    await safely(async () => {
      if (feedStore.mentionsPosts[0]) {
        const latestItem = feedStore.mentionsPosts
          .find(item => item.isLatestInThread) || feedStore.mentionsPosts[0];
        handleSelectReply(latestItem, 'reply');
      } else {
        toast.show(msg.toastNoRecentMention, 'info');
      }
    }, msg.toastFetchMentionsFailed);
  }

  function handleSelectReply(item: FeedItem, type: TargetReplyType) {
    if (
      type !== 'user_reply' ||
      !item.actor?.handle ||
      item.actor?.handle !== agent.session?.handle ||
      item.withPostAction
    ) {
      composeTarget = { type, item };
    }
    setTimeout(() => {
      composeBoxComp?.focusTextarea();
    }, 50);
  }

  function handleNewMention() {
    toast.show(msg.toastNewMentions, 'reply');
    updateWindowIcon(settingsStore.accentColor);
    window.addEventListener('pointerdown', resetIcon, { once: true });
    window.addEventListener('keydown', resetIcon, { once: true });
    if (settingsStore.switchToMentionsOnNew) {
      handleTabChange('mentions');
    }
  }

  function pushHistory() {
    if (isNavigatingBack || !feedSection) return;
    navigationHistory.push({
      feedHistoryEntry: feedStore.snapshotHistoryEntry(),
      scrollTop: feedSection.scrollTop,
      composeTarget: composeTarget,
    });
  }

  async function handleGoBack() {
    if (navigationHistory.length === 0) return;

    isNavigatingBack = true;
    isSkipAnimation = true;
    const prev = navigationHistory.pop();

    if (prev) {
      feedStore.applyHistoryEntry(prev.feedHistoryEntry);
      composeTarget = prev.composeTarget;

      requestAnimationFrame(() => {
        if (feedSection) {
          feedSection.scrollTo({
            top: prev.scrollTop || 0,
            behavior: 'instant'
          });
        }
      });
    }
    isNavigatingBack = false;
    isSkipAnimation = false;
  }

  function handleClearHistory() {
    navigationHistory.length = 0;
  }

  function scrollToTop() {
    scrollBarComp?.scrollToTop();
  }

  async function syncTrayMenu() {
    try {
      await invoke('update_tray_texts', {
        toggleText: msg.trayToggle,
        quitText: msg.trayQuit,
      });
    } catch (err) {
      console.error('Failed to sync tray menu texts:', err);
    }
  }

  async function handleWindowBlur() {
    if (dialog.isOpen) return;
    if (getAndResetSkipBlurScroll()) return;
    const viewerWindow = await WebviewWindow.getByLabel('image-viewer');
    if (viewerWindow?.isVisible()) {
      return;
    }
    isWindowFocused = false;
    if (!settingsStore.autoScrollOnBlur) {
      return;
    }
    if (feedStore.activeTab !== 'settings') {
      scrollToTop();
    }
  }

  function handleWindowFocused() {
    isWindowFocused = true;
    setTimeout(() => {
      if (!document.querySelector('.card.post.focus')) {
        composeBoxComp?.focusTextarea();
      }
    }, 300);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isLoggedIn) return;
    if (toolbarComp?.handleKeyNavigation(e)) {
      return;
    }
    if (e.key?.toLowerCase() === 'r' && e.altKey) {
      handleSelectLatestReply();
    } else if (e.key === 'Home') {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        if (e.target.value) {
          return;
        }
      }
      e.preventDefault();
      scrollToTop();
      composeBoxComp?.focusTextarea();
    } else if (e.key === 'ArrowLeft' && e.altKey) {
      e.preventDefault();
      handleGoBack();
    } else if (e.key === 'Backspace') {
      if (e.target?.value && (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT')) {
        return;
      } else {
        e.preventDefault();
        handleGoBack();
      }
    }
  }

  const postActionOptions: PostActionOptions = {
    onReply: (item) => handleSelectReply(item, 'reply'),
    onUserReply: (actor) => handleSelectReply({ actor, withPostAction: true }, 'user_reply'),
    onQuote: (item) => handleSelectReply(item, 'quote'),
    onViewQuotes: (item) => handleViewQuotes(item),
    onOpenThread: handleOpenThread,
    onSearch: handleSearch,
    onAddTag: handleAddTag,
    onSelectFeed: (myFeed) => handleSelectFeed(myFeed),
  };
  setContext(POST_ACTION_OPTIONS_KEY, postActionOptions);
</script>

<main
  class="container"
  ondragover={(e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = composeBoxComp ? 'copy' : 'none';
    }
    isDraggingOver = true;
  }}
  ondragenter={(e) => { e.preventDefault(); isDraggingOver = true; }}
  ondragleave={() => isDraggingOver = false}
  ondrop={(e) => {
    isDraggingOver = false;
    composeBoxComp?.handleDrop(e);
  }}
>
  {#if isLoading}
    <div class="loading-box"></div>
  {:else if !isLoggedIn}
    <LoginForm
      bind:handle
      bind:password
      bind:rememberPassword
      {isLoading}
      onlogin={handleLogin}
      {msg}
      {i18n}
    />
  {:else}
    <div class="feed-wrapper">
      <section
        bind:this={feedSection}
        class="feed-section"
      >
        <div
          bind:this={headerSection}
          class="collapsible-header-section"
          class:collapsed={
            !isWindowFocused &&
            settingsStore.autoHideHeaderOnBlur &&
            !composeBoxComp?.hasAny()
          }
        >
          <div class="header-inner-content">
            <Toolbar
              bind:this={toolbarComp}
              activeTab={feedStore.activeTab}
              hasHistory={navigationHistory.length > 0}
              onTabChange={(tab) => handleTabChange(tab)}
              onCancel={() => composeTarget = null}
              onGoBack={() => handleGoBack()}
              onSearch={handleSearch}
              onSelectFeed={handleSelectFeed}
              onSelectUser={handleSelectUser}
            />
            {#if feedStore.activeTab !== 'settings' && feedStore.activeTab !== 'notifications'}
              <ComposeBox
                bind:this={composeBoxComp}
                {composeTarget}
                {tags}
                onCancel={() => composeTarget = null}
                onPostSuccess={handlePostSuccess}
                onMoveToTimeline={timelineComp?.focusFirstPost}
                onGoBack={() => handleGoBack()}
                onRemoveTag={handleRemoveTag}
              />
            {/if}
          </div>
        </div>
        <ScrollBar scrollTarget={feedSection} bind:this={scrollBarComp}/>
        {#key feedStore.activeTab}
          <div class="fade-wrapper">
            {#if feedStore.activeTab === 'settings'}
              <SettingsView
                onLogout={handleLogout}
                accounts={storedAccounts}
                currentHandle={handle}
                onSwitchAccount={switchAccount}
              />
            {:else if feedStore.activeTab === 'notifications'}
              <Notifications
                initialPosts={feedStore.currentPosts}
                {isSkipAnimation}
                onSelectUser={handleSelectUser}
                onOpenThread={handleOpenThread}
              />
            {:else}
              <Timeline
                bind:this={timelineComp}
                initialPosts={feedStore.currentPosts}
                {isSkipAnimation}
                {myDid}
                highlightUri={feedStore.activeTab === 'thread' ? feedStore.target.key : ""}
                onSelectUser={handleSelectUser}
                onMoveToCompose={composeBoxComp?.focusTextarea}
              />
            {/if}
          </div>
        {/key}
      </section>
    </div>
  {/if}
</main>

<style>
  .feed-section {
    overscroll-behavior-y: none;
  }
  .collapsible-header-section {
    position: sticky;
    top: 0;
    display: grid;
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
    transition: .2s;
    z-index: 30;
  }
  .header-inner-content {
    overflow: hidden;
    background-color: color-mix(in srgb, var(--bg-app) calc(var(--toolbar-opacity, 0) * 1%), transparent);
    backdrop-filter: blur(8px);
  }
  .collapsible-header-section.collapsed {
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
  }
  .fade-wrapper {
    animation: fadeIn 0.3s;
  }
  @keyframes fadeIn {
    from { opacity: 0.5; }
    to { opacity: 1; }
  }
</style>
