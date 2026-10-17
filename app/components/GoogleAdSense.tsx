'use client';

import Script from 'next/script';

/**
 * Global AdSense publisher script.
 *
 * Loaded once in the root layout <head> via Next.js `Script`. It is
 * intentionally NOT embedded on individual pages, so we never get
 * duplicate copies of the SDK on the same document.
 *
 * Delivery:
 *  - `afterInteractive` is the framework-recommended default for a
 *    publisher script that does not need to run before hydration. It
 *    loads asynchronously and does not block the initial paint.
 *  - The tag itself uses `async`, so even if the browser begins fetching
 *    it before hydration, it will not block rendering.
 *
 * Publisher ID should come from your own AdSense account. This file is a
 * thin wrapper; the real config (and real slot IDs) belong in the AdSense
 * dashboard, not in the repo.
 */
export function GoogleAdSense({ publisherId }: { publisherId: string }) {
  const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;

  return (
    <Script
      id="adsbygoogle-publisher"
      strategy="afterInteractive"
      src={src}
      crossOrigin="anonymous"
      async={true}
    />
  );
}
