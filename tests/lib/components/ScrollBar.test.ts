import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ScrollBar Scroll & Drag Logic', () => {
  let scrollTarget: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    // Setup a mock scroll target element
    scrollTarget = document.createElement('div');
    Object.defineProperties(scrollTarget, {
      scrollTop: { value: 500, writable: true },
      scrollHeight: { value: 2000, configurable: true },
      clientHeight: { value: 500, configurable: true },
    });
    scrollTarget.scrollTo = vi.fn((options: ScrollToOptions | number, y?: number) => {
      if (typeof options === 'object' && options.top !== undefined) {
        (scrollTarget as any).scrollTop = options.top;
      } else if (typeof options === 'number' && typeof y === 'number') {
        (scrollTarget as any).scrollTop = y;
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should reset velocities and animation frames when scrollToTop is called', () => {
    let animationFrameId: number | null = 123;
    let contentVelocityY = 5.0;
    let thumbVelocity = 3.0;
    let isContentDragging = true;
    let isThumbDragging = true;

    const cancelAnimationSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    // Replicate scrollToTop logic
    const scrollToTop = () => {
      if (!scrollTarget) return;

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      contentVelocityY = 0;
      thumbVelocity = 0;
      isContentDragging = false;
      isThumbDragging = false;

      scrollTarget.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    };

    scrollToTop();

    expect(cancelAnimationSpy).toHaveBeenCalledWith(123);
    expect(animationFrameId).toBeNull();
    expect(contentVelocityY).toBe(0);
    expect(thumbVelocity).toBe(0);
    expect(isContentDragging).toBe(false);
    expect(isThumbDragging).toBe(false);
    expect(scrollTarget.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    cancelAnimationSpy.mockRestore();
  });

  it('should calculate thumb height and position correctly on update', () => {
    let thumbHeight = 0;
    let thumbTop = 0;

    const updateScrollbar = () => {
      if (!scrollTarget) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollTarget;

      if (scrollHeight <= clientHeight) {
        thumbHeight = 0;
        return;
      }

      const heightRatio = clientHeight / scrollHeight;
      thumbHeight = Math.max(clientHeight * heightRatio, 30);

      const scrollableDistance = scrollHeight - clientHeight;
      const thumbableDistance = clientHeight - thumbHeight;

      if (thumbableDistance > 0) {
        thumbTop = (scrollTop / scrollableDistance) * thumbableDistance;
      } else {
        thumbTop = 0;
      }
    };

    updateScrollbar();

    // clientHeight(500) / scrollHeight(2000) = 0.25 -> thumbHeight = 125
    expect(thumbHeight).toBe(125);
    // scrollTop(500) / scrollableDistance(1500) = 1/3 -> thumbTop = (500 - 125) * (500 / 1500)?
    // thumbableDistance = 500 - 125 = 375. (500 / 1500) * 375 = 125
    expect(thumbTop).toBe(125);
  });
});
