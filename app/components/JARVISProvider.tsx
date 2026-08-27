'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { JARVIS } from './JARVIS';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

interface JarvisContextType {
  openJarvis: () => void;
  closeJarvis: () => void;
  isOpen: boolean;
  isAdmin: boolean;
}

const JarvisContext = createContext<JarvisContextType>({
  openJarvis: () => {},
  closeJarvis: () => {},
  isOpen: false,
  isAdmin: false,
});

export function useJarvis() {
  return useContext(JarvisContext);
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const openJarvis = useCallback(() => setIsOpen(true), []);
  const closeJarvis = useCallback(() => setIsOpen(false), []);

  // Check admin status (listen for login/logout across tabs)
  useEffect(() => {
    const checkAdmin = () => {
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          setIsAdmin(ADMIN_EMAILS.includes(user.email));
        } else {
          setIsAdmin(false);
        }
      } catch { setIsAdmin(false); }
    };
    checkAdmin();
    window.addEventListener('storage', checkAdmin);
    return () => window.removeEventListener('storage', checkAdmin);
  }, []);

  // Keyboard shortcut: Ctrl+/ or Cmd+/
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        if (isAdmin) setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isAdmin]);

  return (
    <JarvisContext.Provider value={{ openJarvis, closeJarvis, isOpen, isAdmin }}>
      {children}
      {isAdmin && <JARVIS open={isOpen} onClose={closeJarvis} />}
    </JarvisContext.Provider>
  );
}
