// Shared types for the ⚙️ Modules Discord selector system.

export type ChannelKind = 'text' | 'voice' | 'category' | 'news' | 'stage' | 'store';

export interface DiscordChannel {
  id: string;
  name: string;
  type: ChannelKind | number;
  categoryId?: string | null;
  position: number;
  topic?: string | null;
  memberCount?: number | null;
  bitrate?: number | null;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: string;
  position: number;
  icon?: string | null;
}

export interface DiscordMember {
  id: string;
  user: { id: string; username: string; avatar?: string | null; bot?: boolean } | null;
  nick?: string | null;
  roles: string[];
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export type ResourceKind = 'channel' | 'category' | 'role' | 'member';

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'warning' | 'info';
  message: string;
}
