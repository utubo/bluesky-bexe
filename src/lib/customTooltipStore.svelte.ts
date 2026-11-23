import { getProfileWithCache } from '$lib/bsky';
import { type EmbedImage } from '$lib/postMedia';

export interface CustomTooltipState {
  images: string[];
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
}

export const customTooltip = $state<CustomTooltipState>({
  images: [],
  profile: null,
});

const TAGET_CLASS = 'custom-tooltip-target';
let customTooltipTarget: Element | null = null;
let tooltipRequestSeq = 0;

function nextRequestId(): number {
  tooltipRequestSeq += 1;
  return tooltipRequestSeq;
}

function setTarget(e?: MouseEvent) {
  customTooltipTarget?.classList?.remove(TAGET_CLASS);
  const nextTarget = e?.target;
  nextTarget?.classList?.add(TAGET_CLASS);
  customTooltipTarget = nextTarget;;
}

export function popupImages(urls: string[], e?: MouseEvent) {
  nextRequestId();
  customTooltip.images = [...urls];
  customTooltip.profile = null;
  setTarget(e);
}

export function popupEmbedImages(embedImages: EmbedImage[], e?: MouseEvent) {
  popupImages(embedImages.map(i => i.thumb || i.fullsize), e);
}

export async function popupProfile(did, e?: MouseEvent){
  const reqId = nextRequestId();
  const target = e?.target;
  const profile = await getProfileWithCache(did);
  if (reqId !== tooltipRequestSeq) return;
  customTooltip.images = [];
  customTooltip.profile = profile;
  setTarget(e);
}

