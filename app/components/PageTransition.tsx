'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Wraps page content with cinematic transition animations.
 * On route change: fade out → slide + blur in → reveal content.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<'entering' | 'idle' | 'exiting'>('idle');
  const prevPath = useRef(pathname);
  const [displayChildren, setDisplayChildren] = useState(children);

  useEffect(() => {
    if (pathname !== prevPath.current) {
      // Route changed — animate out, swap content, animate in
      setState('exiting');
      const t1 = setTimeout(() => {
        setDisplayChildren(children);
        prevPath.current = pathname;
        setState('entering');
        const t2 = setTimeout(() => setState('idle'), 500);
        return () => clearTimeout(t2);
      }, 300);
      return () => clearTimeout(t1);
    } else {
      // First mount — just animate in
      setState('entering');
      const t = setTimeout(() => setState('idle'), 500);
      return () => clearTimeout(t);
    }
  }, [pathname, children]);

  return (
    <div
      className="page-transition-wrapper"
      style={{
        opacity: state === 'exiting' ? 0 : 1,
        // Transform/filter only while actually animating: in the idle state
        // they would create a permanent stacking context, which traps
        // position:fixed children (chat sidebar) and breaks their viewport
        // positioning.
        transform: state === 'idle' ? undefined : state === 'exiting' ? 'translateY(8px) scale(0.99)' : 'translateY(0) scale(1)',
        filter: state === 'exiting' ? 'blur(4px)' : undefined,
        transition: state === 'idle' ? undefined : 'opacity 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1), filter 0.3s cubic-bezier(0.4,0,0.2,1)',
        willChange: state === 'idle' ? undefined : 'opacity, transform, filter',
      }}
    >
      {displayChildren}
    </div>
  );
}
