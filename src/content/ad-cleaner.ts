type AdCleanerController = {
  disconnect: () => void;
};

type CleanAdsResult = {
  hiddenCount: number;
  youtubeAdSkipCount?: number;
};

const AD_CLEANER_DEBOUNCE_MS = 120;
const EXTENSION_OWNED_SELECTOR =
  '[data-floating-ball="true"], [data-translation-for], [data-immersive-ignore="true"]';
const BLOCKED_TAGS = new Set([
  'HTML',
  'BODY',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
]);
const AD_IFRAME_SOURCE_PATTERN =
  /(doubleclick|googlesyndication|googleadservices|adservice|\/ads?[/?#]|taboola|outbrain|adnxs|pubmatic|criteo)/i;
const AD_TOKEN_PATTERN =
  /(^|[-_\s])(ad|ads|advert|advertisement|sponsor|sponsored|promoted|promo|adslot|adunit|adsbygoogle|taboola|outbrain|native-ad|ad-banner|ad-container|ad-card|ad-wrapper)([-_\s]|$)/i;
const AD_ATTRIBUTE_SELECTOR = [
  '[data-ad]',
  '[data-ads]',
  '[data-ad-slot]',
  '[data-ad-unit]',
  '[data-testid*="ad" i]',
  '[data-testid*="sponsor" i]',
  '[data-testid*="promoted" i]',
  '[aria-label*="advert" i]',
  '[aria-label*="sponsor" i]',
  '[id*="adsbygoogle" i]',
  '[class*="adsbygoogle" i]',
  '[id*="taboola" i]',
  '[class*="taboola" i]',
  '[id*="outbrain" i]',
  '[class*="outbrain" i]',
].join(', ');
const YOUTUBE_PLAYER_SELECTOR = '#movie_player, .html5-video-player';
const YOUTUBE_AD_PLAYER_SELECTOR =
  '#movie_player.ad-showing, #movie_player.ad-interrupting, .html5-video-player.ad-showing, .html5-video-player.ad-interrupting';
const YOUTUBE_SKIP_BUTTON_SELECTOR = [
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button',
  '.ytp-ad-overlay-close-button',
  'button[class*="skip" i][class*="ad" i]',
].join(', ');

export function cleanAds(root: HTMLElement): CleanAdsResult {
  let hiddenCount = 0;
  const youtubeAdSkipCount = skipYoutubeAds(root);

  collectAdCandidates(root).forEach((element) => {
    if (!canHideElement(element)) {
      return;
    }

    element.dataset.immersiveAdHidden = 'true';
    element.dataset.immersiveIgnore = 'true';
    element.style.display = 'none';
    hiddenCount += 1;
  });

  return youtubeAdSkipCount > 0 ? { hiddenCount, youtubeAdSkipCount } : { hiddenCount };
}

export function startAdCleaner(root: HTMLElement): AdCleanerController {
  cleanAds(root);

  let timer: number | undefined;
  const observer = new MutationObserver((mutations) => {
    if (!hasPotentialAdMutation(mutations)) {
      return;
    }

    if (timer !== undefined) {
      window.clearTimeout(timer);
    }

    timer = window.setTimeout(() => {
      cleanAds(root);
    }, AD_CLEANER_DEBOUNCE_MS);
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'id', 'src', 'aria-label', 'data-testid'],
  });

  return {
    disconnect() {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      observer.disconnect();
    },
  };
}

function collectAdCandidates(root: HTMLElement): HTMLElement[] {
  const candidates = new Set<HTMLElement>();

  root.querySelectorAll(AD_ATTRIBUTE_SELECTOR).forEach((node) => {
    if (node instanceof HTMLElement) {
      candidates.add(node);
    }
  });

  root.querySelectorAll('iframe').forEach((node) => {
    if (node instanceof HTMLIFrameElement && AD_IFRAME_SOURCE_PATTERN.test(node.src)) {
      candidates.add(node);
    }
  });

  root.querySelectorAll<HTMLElement>('[id], [class], [aria-label], [data-testid]').forEach(
    (element) => {
      if (hasAdToken(element)) {
        candidates.add(element);
      }
    },
  );

  return Array.from(candidates);
}

function canHideElement(element: HTMLElement): boolean {
  return (
    !BLOCKED_TAGS.has(element.tagName) &&
    !isYoutubePlayerElement(element) &&
    !element.closest(EXTENSION_OWNED_SELECTOR) &&
    element.dataset.immersiveAdHidden !== 'true'
  );
}

function skipYoutubeAds(root: HTMLElement): number {
  const adPlayers = Array.from(root.querySelectorAll<HTMLElement>(YOUTUBE_AD_PLAYER_SELECTOR));
  let skipCount = 0;

  adPlayers.forEach((player) => {
    const skipButton = player.querySelector<HTMLElement>(YOUTUBE_SKIP_BUTTON_SELECTOR);
    if (skipButton && isActionableSkipButton(skipButton)) {
      skipButton.click();
      skipCount += 1;
    }

    player.querySelectorAll('video').forEach((video) => {
      accelerateVideoAd(video);
    });
  });

  return skipCount;
}

function accelerateVideoAd(video: HTMLVideoElement) {
  try {
    video.muted = true;
  } catch {
    // Ignore media property failures from transient YouTube player states.
  }

  try {
    video.playbackRate = Math.max(video.playbackRate || 1, 16);
  } catch {
    // Some browsers reject playbackRate changes while the media element is swapping sources.
  }

  try {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.max(video.currentTime, video.duration);
    }
  } catch {
    // Seeking can fail when the ad source is not ready yet; the next cleaner tick will retry.
  }
}

function isYoutubePlayerElement(element: HTMLElement): boolean {
  return element.matches(YOUTUBE_PLAYER_SELECTOR) || Boolean(element.closest(YOUTUBE_PLAYER_SELECTOR));
}

function isActionableSkipButton(element: HTMLElement): boolean {
  return (
    !element.hasAttribute('disabled') &&
    element.getAttribute('aria-disabled') !== 'true' &&
    element.hidden !== true &&
    element.style.display !== 'none' &&
    element.style.visibility !== 'hidden'
  );
}

function hasPotentialAdMutation(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) => {
    if (mutation.type === 'attributes') {
      return mutation.target instanceof HTMLElement && hasAdToken(mutation.target);
    }

    return Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      return (
        hasAdToken(node) ||
        node.matches(AD_ATTRIBUTE_SELECTOR) ||
        Boolean(node.querySelector(AD_ATTRIBUTE_SELECTOR))
      );
    });
  });
}

function hasAdToken(element: HTMLElement): boolean {
  return [
    element.id,
    element.className,
    element.getAttribute('aria-label'),
    element.getAttribute('data-testid'),
  ].some((value) => typeof value === 'string' && AD_TOKEN_PATTERN.test(value));
}
