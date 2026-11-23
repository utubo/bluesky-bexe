import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    show: vi.fn(),
    setFocus: vi.fn(),
    close: vi.fn(),
  }),
}));

describe('Image Viewer Logic & State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse multiple images and index from search params', () => {
    const searchParams = new URLSearchParams('urls=' + encodeURIComponent(JSON.stringify(['https://example.com/1.jpg', 'https://example.com/2.jpg'])) + '&index=1');
    
    const urlsParam = searchParams.get('urls');
    const images = urlsParam ? JSON.parse(decodeURIComponent(urlsParam)) : [];
    const currentIndex = parseInt(searchParams.get('index') || '0', 10);

    expect(images).toHaveLength(2);
    expect(images[1]).toBe('https://example.com/2.jpg');
    expect(currentIndex).toBe(1);
  });

  it('should fall back to single url if urls param is missing', () => {
    const searchParams = new URLSearchParams('url=' + encodeURIComponent('https://example.com/single.jpg'));
    
    const urlsParam = searchParams.get('urls');
    let images: string[] = [];
    if (urlsParam) {
      images = JSON.parse(decodeURIComponent(urlsParam));
    } else {
      const singleUrl = searchParams.get('url');
      images = singleUrl ? [singleUrl] : [];
    }

    expect(images).toHaveLength(1);
    expect(images[0]).toBe('https://example.com/single.jpg');
  });

  it('should handle navigation bounds correctly', () => {
    const images = ['img1.jpg', 'img2.jpg', 'img3.jpg'];
    let currentIndex = 0;

    const nextImage = () => {
      currentIndex = (currentIndex + 1) % images.length;
    };

    const prevImage = () => {
      currentIndex = (currentIndex - 1 + images.length) % images.length;
    };

    // Forward navigation
    nextImage();
    expect(currentIndex).toBe(1);
    nextImage();
    expect(currentIndex).toBe(2);
    nextImage(); // Wraps around to 0
    expect(currentIndex).toBe(0);

    // Backward navigation
    prevImage(); // Wraps around to 2
    expect(currentIndex).toBe(2);
    prevImage();
    expect(currentIndex).toBe(1);
  });

  it('should clamp scale factor within limits (1 to 10)', () => {
    let scale = 1;
    const zoomFactor = 1.15;

    const zoomIn = () => {
      scale = Math.max(1, Math.min(scale * zoomFactor * zoomFactor * zoomFactor * zoomFactor * zoomFactor * zoomFactor * zoomFactor * zoomFactor * zoomFactor * zoomFactor, 10));
    };

    const zoomOut = () => {
      scale = Math.max(1, Math.min(scale / zoomFactor, 1));
    };

    zoomIn();
    expect(scale).toBeLessThanOrEqual(10);
    expect(scale).toBeGreaterThanOrEqual(1);

    // Reset and test zoom out minimum clamp
    scale = 1;
    zoomOut();
    expect(scale).toBe(1);
  });

  it('should calculate correct translation for double click zoom at specific position', () => {
    // Mock window size
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);

    let scale = 1;
    let translateX = 0;
    let translateY = 0;

    const handleDoubleClick = (clientX: number, clientY: number) => {
      if (scale === 1) {
        const newScale = 3;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const dx = clientX - centerX;
        const dy = clientY - centerY;

        translateX = dx * (1 - newScale);
        translateY = dy * (1 - newScale);
        scale = newScale;
      }
    };

    // Click at (700, 500) where center is (500, 400)
    // dx = 200, dy = 100
    // translateX = 200 * (1 - 3) = -400
    // translateY = 100 * (1 - 3) = -200
    handleDoubleClick(700, 500);

    expect(scale).toBe(3);
    expect(translateX).toBe(-400);
    expect(translateY).toBe(-200);

    // Restore
    vi.stubGlobal('innerWidth', originalInnerWidth);
    vi.stubGlobal('innerHeight', originalInnerHeight);
  });

  it('should calculate correct translation for drag-zoom using mouse down focal point', () => {
    // Mock window size
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);

    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    const downX = 700;
    const downY = 500;
    const baseScale = 1;
    const baseTranslateX = 0;
    const baseTranslateY = 0;

    const handleZoom = (newScale: number) => {
      const centerX = window.innerWidth / 2; // 500
      const centerY = window.innerHeight / 2; // 400
      const focalX = downX - centerX; // 200
      const focalY = downY - centerY; // 100

      const scaleRatio = newScale / baseScale;
      translateX = focalX - (focalX - baseTranslateX) * scaleRatio;
      translateY = focalY - (focalY - baseTranslateY) * scaleRatio;
      scale = newScale;
    };

    // Zoom in to scale 2.0
    handleZoom(2.0);

    // focalX = 200, scaleRatio = 2.0
    // translateX = 200 - (200 - 0) * 2.0 = 200 - 400 = -200
    // translateY = 100 - (100 - 0) * 2.0 = 100 - 200 = -100
    expect(scale).toBe(2.0);
    expect(translateX).toBe(-200);
    expect(translateY).toBe(-100);

    // Restore window globals
    vi.stubGlobal('innerWidth', originalInnerWidth);
    vi.stubGlobal('innerHeight', originalInnerHeight);
  });
});
