'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { JARVIS } from './JARVIS';

interface JarvisContextType {
  openJarvis: () => void;
  closeJarvis: () => void;
  isOpen: boolean;
}

const JarvisContext = createContext<JarvisContextType>({
  openJarvis: () => {},
  closeJarvis: () => {},
  isOpen: false,
});

export function useJarvis() {
  return useContext(JarvisContext);
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openJarvis = useCallback(() => setIsOpen(true), []);
  const closeJarvis = useCallback(() => setIsOpen(false), []);

  // Keyboard shortcut: Ctrl+/ or Cmd+/
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <JarvisContext.Provider value={{ openJarvis, closeJarvis, isOpen }}>
      {children}
      <JARVIS open={isOpen} onClose={closeJarvis} />
    </JarvisContext.Provider>
  );
}
