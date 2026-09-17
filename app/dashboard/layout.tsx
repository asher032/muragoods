import type { ReactNode } from 'react';
import { GuildProvider } from '@/app/lib/guild-context';
import DashboardShell from './components/DashboardShell';
import './cc.css';

// Server layout: provides the guild context, then renders the client shell
// (auth gate + sidebar + topbar). Pages call useGuild() and always find it.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <GuildProvider>
      <DashboardShell>{children}</DashboardShell>
    </GuildProvider>
  );
}
