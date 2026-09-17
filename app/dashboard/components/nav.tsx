'use client';

import {
  Activity, BarChart3, Bot, Coins, Film, Gamepad2, Gift, Heart,
  HeartPulse, ListMusic, MessageSquare, ScrollText, Siren,
  Settings, Shield, ShieldAlert, Star, Ticket, Timer, Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export const DASH_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'BOT',
    items: [
      { label: 'Command Center', href: '/dashboard', icon: <Bot size={16} /> },
      { label: 'Commands', href: '/dashboard/commands', icon: <ListMusic size={16} /> },
      { label: 'Activity', href: '/dashboard/audit', icon: <Activity size={16} /> },
      { label: 'Analytics', href: '/dashboard/analytics', icon: <BarChart3 size={16} /> },
      { label: 'Health', href: '/dashboard/health', icon: <HeartPulse size={16} /> },
    ],
  },
  {
    label: 'MODULES',
    items: [
      { label: 'Module Setup', href: '/dashboard/modules', icon: <Settings size={16} /> },
      { label: 'Moderation', href: '/dashboard/moderation', icon: <Shield size={16} /> },
      { label: 'Security', href: '/dashboard/security', icon: <ShieldAlert size={16} /> },
      { label: 'Tickets', href: '/dashboard/tickets/center', icon: <Ticket size={16} /> },
      { label: 'Music', href: '/dashboard/music', icon: <ListMusic size={16} /> },
      { label: 'Leveling', href: '/dashboard/leveling', icon: <Star size={16} /> },
      { label: 'Economy', href: '/dashboard/economy', icon: <Coins size={16} /> },
      { label: 'Fun', href: '/dashboard/fun', icon: <Gamepad2 size={16} /> },
      { label: 'Giveaways', href: '/dashboard/giveaways', icon: <Gift size={16} /> },
      { label: 'Suggestions', href: '/dashboard/suggestions', icon: <MessageSquare size={16} /> },
      { label: 'Reminders', href: '/dashboard/reminders', icon: <Timer size={16} /> },
      { label: 'Reputation', href: '/dashboard/reputation', icon: <Heart size={16} /> },
      { label: 'Murastream', href: '/dashboard/murastream', icon: <Film size={16} /> },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { label: 'Directory', href: '/dashboard/directory', icon: <Users size={16} /> },
      { label: 'Cases', href: '/dashboard/cases', icon: <Shield size={16} /> },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { label: 'Error Center', href: '/dashboard/errors', icon: <Siren size={16} /> },
      { label: 'Audit Log', href: '/dashboard/audit', icon: <ScrollText size={16} /> },
      { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={16} /> },
    ],
  },
];
