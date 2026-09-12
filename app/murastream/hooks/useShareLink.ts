'use client';

import { useState, useCallback, useEffect } from 'react';

// Share a title: native share sheet on mobile (with fallback to clipboard),
// clipboard copy elsewhere. `shared` flips true briefly so buttons can show
// a check state.
export function useShareLink() {
  const [shared, setShared] = useState(false);

  const copyShareLink = useCallback(async (item: { id: number | string; mediaType: string; title?: string }) => {
    const url = `${window.location.origin}/murastream/${item.mediaType}/${item.id}`;
    try {
      const nav = navigator as Navigator & { share?: (data: { title?: string; url: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: item.title || 'Watch on MuraStream', url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShared(true);
    } catch {
      // User cancelled the share sheet — no state change.
    }
  }, []);

  useEffect(() => {
    if (!shared) return;
    const t = setTimeout(() => setShared(false), 2500);
    return () => clearTimeout(t);
  }, [shared]);

  return { shared, copyShareLink };
}
