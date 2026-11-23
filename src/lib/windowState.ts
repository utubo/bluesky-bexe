let skipBlurScroll = false;

export function setSkipBlurScroll(val: boolean = true) {
  skipBlurScroll = val;
}

export function getAndResetSkipBlurScroll(): boolean {
  const current = skipBlurScroll;
  skipBlurScroll = false;
  return current;
}

