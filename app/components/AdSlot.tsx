'use client';

import { useEffect, useRef } from 'react';

/**
 * Reserved AdSense ad unit.
 *
 * - Renders only on the client when `adsbygoogle.js` SDK is present.
 * - Pushes exactly one ad unit per mount, then no more — React re-renders
 *   do not re-trigger ad requests and we never re-initialize the same
 *   element.
 * - Uses a responsive `data-ad-format` + fixed aspect container so the
 *   layout has reserved space and does not collapse when the ad has not
 *   started serving yet.
 *
 * Slot IDs must come from the AdSense dashboard. This component does NOT
 * invent them. Pass the REAL `data-ad-slot` value once you create the unit
 * in AdSense; until then leave `adSlotId` empty and the placeholder keeps
 * the layout intact without sending an ad request.
 */
export function AdSlot({
  adSlotId = '',
  format = 'auto',
  style,
  className = '',
  test = false,
}: {
  /** Real AdSense slot ID from the dashboard. Empty = reserved placeholder only. */
  adSlotId?: string;
  /** `auto` (responsive) or `horizontal` / `vertical` / `rect`. */
  format?: 'auto' | 'horizontal' | 'vertical' | 'rect';
  style?: React.CSSProperties;
  className?: string;
  /** Render a TEST placeholder instead of calling the AdSense SDK. */
  test?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (test) return;
    if (!containerRef.current || pushedRef.current) return;

    // SDK may not have finished loading yet. AdSense only processes
    // `data-ad-slot` elements once the SDK is ready; pushing an explicit
    // unit is the documented path for reserved placements.
    const el = containerRef.current;
    if (!el) return;

    const slot = adSlotId.trim();
    if (!slot) {
      // Reserved space only — no ad request.
      pushedRef.current = true;
      return;
    }

    // Mark pushed BEFORE any async work so a re-render cannot double-push.
    pushedRef.current = true;

    const doPush = () => {
      // Use explicit unit push only when a real slot id is present.
      // `adsbygoogle.push()` is idempotent per element ref when the slot
      // id matches; still, we guard on `pushedRef` so we never call it
      // twice from the same mount.
      if (typeof (window as unknown as Record<string, unknown>).adsbygoogle !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).adsbygoogle = (window as any).adsbygoogle || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).adsbygoogle.push({});
      }
    };

    if ((window as unknown as Record<string, unknown>).adsbygoogle) {
      doPush();
    } else {
      // Defer until the SDK lands on the page.
      const onReady = () => {
        if (containerRef.current) doPush();
        else window.removeEventListener('load', onReady);
      };
      window.addEventListener('load', onReady, { once: true });
    }
  }, [adSlotId, test]);

  const slotAttr = adSlotId ? { 'data-ad-slot': adSlotId } : {};
  const formatAttr = { 'data-ad-format': format };

  return (
    <div
      ref={containerRef}
      className={`mg-ad-slot ${className}`.trim()}
      style={{
        display: 'block',
        position: 'relative',
        width: '100%',
        background: 'rgba(255, 255, 255, 0.025)',
        border: '1px dashed rgba(255, 255, 255, 0.06)',
        borderRadius: '12px',
        overflow: 'hidden',
        minHeight: test ? 96 : 60,
        ...style,
      }}
      {...slotAttr}
      {...formatAttr}
      aria-label="Advertisement"
      role="region"
    >
      {test ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.35)',
            fontSize: 11,
            fontFamily: 'var(--font-arcade)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Ad space reserved — configure slot in AdSense
        </div>
      ) : (
        /* Real AdSense fills this element when the SDK + slot are configured. */
        <noscript>
          <div
            style={{
              padding: '14px 0',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 11,
              fontFamily: 'var(--font-arcade)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Ad space reserved
          </div>
        </noscript>
      )}
    </div>
  );
}
