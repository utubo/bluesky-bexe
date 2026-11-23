import { getContext } from 'svelte';
import { openUrl } from '@tauri-apps/plugin-opener';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { msg, fmt } from '$lib/i18n.svelte';
import { safely } from '$lib/errorStore.svelte';
import {
  likePost,
  deleteLike,
  repostPost,
  deleteRepost,
  createBookmark,
  deleteBookmark,
  followUser,
  unfollowUser,
  type FeedItem,
  type MyFeed,
} from '$lib/bsky';
import { toast } from '$lib/toast.svelte';
import { feedStore, type Author } from '$lib/feedStore.svelte';
import { savePostImage } from '$lib/imageSave';
import { openConfirmDialog } from '$lib/customDialogStore.svelte';

export const POST_ACTION_OPTIONS_KEY = 'post_actions';

export interface PostActionOptions {
  onReply?: (item: FeedItem) => void;
  onUserReply?: (item: Author) => void;
  onQuote?: (item: FeedItem) => void;
  onViewQuotes?: (item: FeedItem) => void;
  onOpenThread?: (item: FeedItem) => void;
  onSearch?: (item: string) => void;
  onAddTag?: (item: string) => void;
  onSelectFeed?: (item: MyFeed) => void;
}

export function createPostActions(getItem: { item: FeedItem }) {
  const { item } = getItem;
  const act = getContext<PostActionOptions>(POST_ACTION_OPTIONS_KEY);
  const getPost = () => item?.post || item;
  const getAuthor = () => getPost()?.author;
  const isLiked = () => !!getPost()?.viewer?.like;
  const isReposted = () => !!getPost()?.viewer?.repost;
  const isBookmarked = () => !!getPost()?.viewer?.bookmarked;

  /** Toggle like status */
  async function toggleLike() {
    const post = getPost();
    const uri = post?.uri;
    const cid = post?.cid;
    if (!uri || !cid) return;

    await safely(async () => {
      if (isLiked() && post.viewer.like) {
        await deleteLike(post.viewer.like);
        post.viewer.like = null;
        post.likeCount = Math.max(0, post.likeCount - 1);
        toast.show(msg.toastUnlike, 'info');
      } else {
        post.viewer.like = await likePost(uri, cid);
        post.likeCount = (post.likeCount || 0) + 1;
        toast.show(msg.toastLike, 'like');
      }
      feedStore.invalidateCache('likes');
    });
  }

  /** Toggle repost status */
  async function toggleRepost() {
    const post = getPost();
    const uri = post?.uri;
    const cid = post?.cid;
    if (!uri || !cid) return;

    await safely(async () => {
      if (isReposted() && post.viewer.repost) {
        await deleteRepost(post.viewer.repost);
        post.viewer.repost = null;
        post.repostCount = Math.max(0, post.repostCount - 1);
        toast.show(msg.toastUnrepost, 'info');
      } else {
        post.viewer.repost = await repostPost(uri, cid);
        post.repostCount = (post.repostCount || 0) + 1;
        toast.show(msg.toastRepost, 'repost');
      }
    });
  }

  async function viewQuotes() {
    if (act.onViewQuotes) act.onViewQuotes(item);
  }

  /** Toggle bookmark status */
  async function toggleBookmark() {
    const post = getPost();
    const uri = post?.uri;
    const cid = post?.cid;
    if (!uri || !cid) return;

    await safely(async () => {
      if (isBookmarked()) {
        await deleteBookmark(uri);
        post.viewer.bookmarked = false;
        toast.show(msg.toastUnbookmark);
      } else {
        post.viewer.bookmarked = await createBookmark(uri, cid);
        toast.show(msg.toastBookmark, 'bookmark');
      }
    });
  }

  /** Toggle follow status for the post author */
  async function toggleFollow() {
    await safely(async () => {
      const post = getPost();
      const author = post?.post?.author || post?.author;
      if (!author || !author.did) return;

      if (author.viewer?.following) {
        const confirmed = await openConfirmDialog(fmt(msg.dlgUnfollowMessage, { authorName: author.displayName || author.handle }));
        if (!confirmed) return;
        await unfollowUser(author.viewer.following);
        author.viewer.following = undefined;
        toast.show(msg.toastUnfollow, 'success');
      } else {
        author.viewer = author.viewer || {};
        author.viewer.following = await followUser(author.did);
        toast.show(msg.toastFollow, 'success');
      }
    });
  }

  /**
   * Calculates the 1-based index of the clicked image element within its container.
   */
  function calculateImageIndex(target: HTMLElement | null, imgSrc: string): number {
    if (!target) return 1;
    const container = target.closest('.media-items') || target.closest('.card.post');
    if (!container) return 1;

    const allImages = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    const index = allImages.findIndex((img) => img.src === imgSrc);
    return index !== -1 ? index + 1 : 1;
  }

  /** Displays the context menu for post actions */
  async function showContextMenu(e: MouseEvent) {
    const post = getPost();
    const author = getAuthor();
    const uri = post?.uri;
    const cid = post?.cid;
    if (!uri || !cid) return;

    const menuItems = [];
    const target = e.target as HTMLElement;

    const isPostMoreBtn = target?.classList?.contains('post-more-btn');

    // Default text menus
    const href = target.getAttribute('href');
    if (href) {
      menuItems.push(await MenuItem.new({
        id: 'copy_link_url',
        text: msg.menuCopyLinkUrl,
        action: () => { writeText(href); },
      }));
    }
    const text = window.getSelection()?.toString();
    if (text) {
      menuItems.push(await MenuItem.new({
        id: 'copy_text',
        text: msg.menuCopy,
        action: () => { writeText(text); },
      }));
      menuItems.push(await MenuItem.new({
        id: 'search_text',
        text: msg.menuSearch,
        action: () => { if (act.onSearch) act.onSearch(text); },
      }));
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    }

    // Hashtag
    const tag = target.classList.contains('post-tag');
    if (tag) {
      menuItems.push(await MenuItem.new({
        id: 'add_tag',
        text: msg.menuAddTagToComposer,
        action: () => { if (act.onAddTag) act.onAddTag(target.textContent); },
      }));
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    }

    // Save image menu item if right-clicked on an image
    if (target.tagName === 'IMG') {
      e.preventDefault();
      const imgSrc = (target as HTMLImageElement).src;
      const imageIndex = calculateImageIndex(target, imgSrc);
      menuItems.push(await MenuItem.new({
        id: 'save_image',
        text: msg.menuSaveImage,
        action: () => {
          savePostImage({ item, imgSrc, imageIndex });
        },
      }));
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    }

    // Open thread
    menuItems.push(await MenuItem.new({
      id: 'open_thread',
      text: msg.menuOpenThread,
      action: () => {
        if (act.onOpenThread) act.onOpenThread(item);
      },
    }));

    if (!isPostMoreBtn) {
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));

      // Like
      menuItems.push(await MenuItem.new({
        id: 'like',
        text: isLiked() ? msg.menuUnlike : msg.menuLike,
        action: toggleLike,
      }));

      // Repost
      menuItems.push(await MenuItem.new({
        id: 'repost',
        text: isReposted() ? msg.menuUnrepost : msg.menuRepost,
        action: toggleRepost,
      }));
    }

    // Quote
    menuItems.push(await MenuItem.new({
      id: 'quote',
      text: msg.menuQuote,
      action: () => {
        if (act.onQuote) act.onQuote(item);
      },
    }));

    // Bookmark
    if (!isPostMoreBtn) {
      menuItems.push(await MenuItem.new({
        id: 'bookmark',
        text: isBookmarked() ? msg.menuUnbookmark : msg.menuBookmark,
        action: toggleBookmark,
      }));
    }

    menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));

    if (!isPostMoreBtn) {
      // Reply
      menuItems.push(await MenuItem.new({
        id: 'reply',
        text: msg.menuReply,
        action: () => {
          if (act.onReply) act.onReply(item);
        },
      }));
    }

    if (author) {
      menuItems.push(await MenuItem.new({
        id: 'reply-to-user',
        text: msg.menuReplyToUser,
        action: () => {
          if (act.onUserReply) act.onUserReply(post?.author || item.actor);
        },
      }));

      if (!isPostMoreBtn) {
        menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
      }

      menuItems.push(await MenuItem.new({
        id: 'follow-user',
        text: author?.viewer?.following ? msg.menuUnfollowUser : msg.menuFollowUser,
        action: toggleFollow,
        enabled: author.did !== feedStore.myDid,
      }));
    }

    menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));

    // Open post in browser
    menuItems.push(await MenuItem.new({
      id: 'open_post_web',
      text: msg.menuOpenPostWeb,
      action: async () => {
        await safely(async () => {
          const parts = uri.split('/');
          const rkey = parts[parts.length - 1];
          const actor = author?.handle || author?.did;
          if (actor && rkey) {
            await openUrl(`https://bsky.app/profile/${actor}/post/${rkey}`);
          }
        });
      },
    }));

    // Open user profile in browser
    menuItems.push(await MenuItem.new({
      id: 'open_user_web',
      text: msg.menuOpenUserWeb,
      action: async () => {
        await safely(async () => {
          const actor = author?.handle || author?.did;
          if (actor) {
            await openUrl(`https://bsky.app/profile/${actor}`);
          }
        });
      },
    }));

    // Delete post
    if (author.did === feedStore.myDid) {
      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
      menuItems.push(await MenuItem.new({
        id: 'delete_post',
        text: msg.delete,
        action: async () => {
          await safely(async () => {
            const confirmed = await openConfirmDialog(msg.dlgDeletePostMessage);
            if (!confirmed) return;
            feedStore.deletePost(uri)
            post.deleted = true;
            toast.show(msg.toastPostDeleted, 'info');
          });
        },
      }));
    }

    const menu = await Menu.new({ items: menuItems });
    await menu.popup();
  }

  return {
    ...act,
    get isLiked() { return isLiked(); },
    get isReposted() { return isReposted(); },
    get isBookmarked() { return isBookmarked(); },
    toggleLike,
    toggleRepost,
    toggleBookmark,
    viewQuotes,
    showContextMenu,
  };
}
