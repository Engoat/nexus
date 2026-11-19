/**
 * jsdom shims for browser APIs the app touches and jsdom does not implement.
 * Each one fills a real gap in jsdom; none of them hides a defect.
 *
 * Guarded, because the algorithm tests run in the node environment where there
 * is no window at all.
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  // jsdom has no layout engine: give every box a plausible size so the canvas
  // can map client coordinates to world coordinates.
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 980,
      height: 620,
      top: 0,
      left: 0,
      right: 980,
      bottom: 620,
      toJSON: () => ({}),
    } as DOMRect;
  };

  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => false;
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(Date.now()), 0)) as unknown as typeof window.requestAnimationFrame;
  }
}
