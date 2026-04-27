type AdCleanerController = {
  disconnect: () => void;
};

type CleanAdsResult = {
  hiddenCount: number;
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

export function cleanAds(root: HTMLElement): CleanAdsResult {
  let hiddenCount = 0;

  collectAdCandidates(root).forEach((element) => {
    if (!canHideElement(element)) {
      return;
    }

    element.dataset.immersiveAdHidden = 'true';
    element.dataset.immersiveIgnore = 'true';
    element.style.display = 'none';
    hiddenCount += 1;
  });

  return { hiddenCount };
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
    !element.closest(EXTENSION_OWNED_SELECTOR) &&
    element.dataset.immersiveAdHidden !== 'true'
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
