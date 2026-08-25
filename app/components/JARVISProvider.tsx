'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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

  return (
    <JarvisContext.Provider value={{ openJarvis, closeJarvis, isOpen }}>
      {children}
      <JARVIS open={isOpen} onClose={closeJarvis} />
    </JarvisContext.Provider>
  );
}
