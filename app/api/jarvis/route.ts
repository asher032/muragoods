import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

// ─── Intent Recognition ──────────────────────────────────────
type Intent = 'NAVIGATION' | 'SEARCH' | 'INFORMATION' | 'CREATION' | 'ACTION' | 'SYSTEM' | 'UNKNOWN';

interface ParsedCommand {
  intent: Intent;
  action: string;
  params: Record<string, string>;
}

function parseCommand(input: string): ParsedCommand {
  const lower = input.toLowerCase().trim();
  const params: Record<string, string> = {};

  // Navigation patterns
  const navPatterns: [RegExp, string][] = [
    [/\b(open|go to|navigate|show|take me to|head to|visit)\b.*\b(profile|account|my profile)\b/, 'profile'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(menu|food|food menu|order|food menu)\b/, 'menu'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(letters?|untold|untold words|confession|anonymous)\b/, 'untold-words'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(rewards?|points?|coins?|my points)\b/, 'points'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(orders?|my orders?|order history)\b/, 'orders'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(home|main|landing)\b/, 'home'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(games?|play|entertainment|fun)\b/, 'entertainment'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(checkout|cart|pay)\b/, 'checkout'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(support|help|contact)\b/, 'support'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(favorites?|saved|wishlist)\b/, 'favorites'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(settings?|preferences)\b/, 'settings'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(admin|dashboard|panel)\b/, 'admin'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(my submissions?|my letters?|my confessions?)\b/, 'my-submissions'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(songs?|send a song|song message)\b/, 'song-create'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(create.*confession|new confession)\b/, 'confession-create'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(create.*letter|new letter|write.*letter)\b/, 'letter-create'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(memory|memory match|flappy)\b/, 'games'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(gallery|browse|explore)\b/, 'gallery'],
  ];

  for (const [pattern, route] of navPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'NAVIGATION', action: route, params };
    }
  }

  // Search patterns
  if (/\b(search|find|look for|look up|browse|query)\b/.test(lower)) {
    const searchMatch = lower.match(/(?:search|find|look for|look up|browse|query)\s+(?:for\s+)?(?:about\s+)?(.+)/);
    if (searchMatch) {
      params.query = searchMatch[1].trim();
      return { intent: 'SEARCH', action: 'search', params };
    }
    return { intent: 'SEARCH', action: 'search', params: { query: '' } };
  }

  // Information patterns
  const infoPatterns: [RegExp, string][] = [
    [/\b(what|who|how|why|when|where|explain|tell me about|describe)\b.*\b(food|menu|product|item|price|cost)\b/, 'menu-info'],
    [/\b(what|who|how|why|when|where|explain|tell me about)\b.*\b(points?|coins?|rewards?|balance)\b/, 'points-info'],
    [/\b(what|who|how|why|when|where|explain|tell me about)\b.*\b(letters?|untold|confession|anonymous)\b/, 'untold-info'],
    [/\b(what|who|how|why|when|where|explain|tell me about)\b.*\b(order|delivery|shipping|deliver)\b/, 'order-info'],
    [/\b(what|who|how|why|when|where|explain|tell me about)\b.*\b(promo|discount|code|coupon)\b/, 'promo-info'],
    [/\b(what|who|how|why|when|where|explain|tell me about)\b.*\b(referral|invite|friend)\b/, 'referral-info'],
    [/\b(hello|hi|hey|good morning|good afternoon|good evening|sup|yo)\b/, 'greeting'],
    [/\b(thanks?|thank you|ty|thx)\b/, 'thanks'],
    [/\b(help|what can you do|capabilities|commands|features)\b/, 'help'],
    [/\b(who are you|what are you|your name|introduce yourself)\b/, 'identity'],
  ];

  for (const [pattern, infoType] of infoPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'INFORMATION', action: infoType, params };
    }
  }

  // Creation patterns
  if (/\b(create|write|make|compose|draft|new)\b.*\b(letter|confession|song|message)\b/.test(lower)) {
    const typeMatch = lower.match(/\b(letter|confession|song|message)\b/);
    params.type = typeMatch?.[1] || 'letter';
    return { intent: 'CREATION', action: 'create', params };
  }

  // Action patterns
  if (/\b(add to cart|order|buy|purchase|checkout)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'order', params };
  }

  if (/\b(check in|daily|daily check)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'checkin', params };
  }

  if (/\b(log ?out|sign ?out|sign ?off)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'logout', params };
  }

  if (/\b(mystery box|open box|spin|random reward)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'mystery-box', params };
  }

  // System patterns
  if (/\b(time|date|what time|current time|clock)\b/.test(lower)) {
    return { intent: 'SYSTEM', action: 'time', params };
  }

  if (/\b(weather|temperature|forecast)\b/.test(lower)) {
    return { intent: 'SYSTEM', action: 'weather', params };
  }

  return { intent: 'UNKNOWN', action: 'unknown', params: { original: input } };
}

// ─── Response Generator ──────────────────────────────────────
function generateResponse(
  parsed: ParsedCommand,
  userName: string | null,
): { response: string; action?: string; actionParams?: Record<string, string> } {
  const name = userName || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  switch (parsed.intent) {
    case 'NAVIGATION': {
      const navMap: Record<string, { path: string; label: string }> = {
        'profile': { path: '/account/profile', label: 'your profile' },
        'menu': { path: '/menu', label: 'the food menu' },
        'untold-words': { path: '/untold-words', label: 'Untold Words' },
        'points': { path: '/points', label: 'Points & Rewards' },
        'orders': { path: '/orders', label: 'your orders' },
        'home': { path: '/', label: 'the homepage' },
        'entertainment': { path: '/entertainment', label: 'Games & Entertainment' },
        'checkout': { path: '/checkout', label: 'checkout' },
        'support': { path: '/support', label: 'support' },
        'favorites': { path: '/favorites', label: 'your favorites' },
        'settings': { path: '/settings', label: 'settings' },
        'admin': { path: '/admin', label: 'the admin dashboard' },
        'my-submissions': { path: '/untold-words/my', label: 'your submissions' },
        'song-create': { path: '/untold-words/song/create', label: 'song creator' },
        'confession-create': { path: '/untold-words/confession/create', label: 'confession creator' },
        'letter-create': { path: '/untold-words/letter/create', label: 'letter creator' },
        'games': { path: '/entertainment', label: 'games' },
        'gallery': { path: '/untold-words', label: 'the Untold Words gallery' },
      };
      const nav = navMap[parsed.action];
      if (nav) {
        return {
          response: `Opening ${nav.label} for you, ${name}.`,
          action: 'navigate',
          actionParams: { path: nav.path },
        };
      }
      break;
    }

    case 'SEARCH': {
      const query = parsed.params.query;
      if (query) {
        return {
          response: `Searching for "${query}"...`,
          action: 'search',
          actionParams: { query },
        };
      }
      return {
        response: `What would you like me to search for, ${name}?`,
        action: 'search',
        actionParams: { query: '' },
      };
    }

    case 'INFORMATION': {
      switch (parsed.action) {
        case 'menu-info':
          return {
            response: `Our menu features freshly made campus food:\n\n🍣 **Musubi** — Classic Hawaiian rice ball\n🍩 **Churros** — Crispy cinnamon-sugar sticks\n☕ **Coffee Jelly** — Sweet coffee gelatin dessert\n🍪 **Cookies** — Freshly baked chocolate chip\n\nWould you like to see the full menu?`,
            action: 'navigate',
            actionParams: { path: '/menu' },
          };
        case 'points-info':
          return {
            response: `**Muragoods Coins** are our reward currency:\n\n🪙 Earn **1 coin** per ₱1 spent on orders\n📅 Daily check-in bonus\n🎮 Play games to earn more\n👥 Refer friends for 50 coins each\n🎁 Mystery Box rewards\n\nCoins can be redeemed for discounts and perks!`,
          };
        case 'untold-info':
          return {
            response: `**Untold Words** is where you express feelings anonymously:\n\n💌 **Letters** — Write digital love letters\n💜 **Confessions** — Share short thoughts anonymously\n🎵 **Songs** — Send a song with a message\n\nYou can browse the gallery, search, and send via Gmail.`,
            action: 'navigate',
            actionParams: { path: '/untold-words' },
          };
        case 'order-info':
          return {
            response: `**Ordering is simple:**\n\n1. Browse the menu\n2. Add items to cart\n3. Checkout and pay via InstaPay\n4. We prepare your order\n5. You get notified when ready!\n\nYou earn coins for every peso spent! 🪙`,
          };
        case 'promo-info':
          return {
            response: `**Promo Codes** give you discounts!\n\n🎟️ Check the Mystery Box for promo codes\n📝 Admin-created codes expire after 1 week\n🔑 Each code can only be used once\n\nEnter your code at checkout!`,
          };
        case 'referral-info':
          return {
            response: `**Referral Program:**\n\n👥 Share your referral code\n🎉 Both you and your friend get **50 coins**\n📋 Find your code in your profile\n\nEveryone wins! 🎮`,
          };
        case 'greeting':
          return {
            response: `${greeting}, ${name}! What can I help you with today?`,
          };
        case 'thanks':
          return {
            response: `You're welcome, ${name}! Always here to help. 😊`,
          };
        case 'help':
          return {
            response: `**I can help you with:**\n\n🗺️ **Navigate** — "Open the menu"\n🔍 **Search** — "Search for musubi"\nℹ️ **Information** — "How do points work?"\n✉️ **Create** — "Write a confession"\n🎮 **Actions** — "Open mystery box"\n⏰ **System** — "What time is it?"\n\nJust speak naturally — I understand context!`,
          };
        case 'identity':
          return {
            response: `I'm **JARVIS** — your intelligent assistant built into Muragoods.\n\nI can navigate, search, create, and help you with anything on this site.\n\nThink of me as your personal operating system. 🤖`,
          };
      }
      break;
    }

    case 'CREATION': {
      const typeMap: Record<string, { path: string; label: string }> = {
        'letter': { path: '/untold-words/letter/create', label: 'letter creator' },
        'confession': { path: '/untold-words/confession/create', label: 'confession creator' },
        'song': { path: '/untold-words/song/create', label: 'song creator' },
        'message': { path: '/untold-words/song/create', label: 'song creator' },
      };
      const type = typeMap[parsed.params.type || 'letter'] || typeMap.letter;
      return {
        response: `Opening the ${type.label} for you, ${name}. Express yourself! ✨`,
        action: 'navigate',
        actionParams: { path: type.path },
      };
    }

    case 'ACTION': {
      switch (parsed.action) {
        case 'order':
          return {
            response: `Let me take you to checkout, ${name}. 🛒`,
            action: 'navigate',
            actionParams: { path: '/checkout' },
          };
        case 'checkin':
          return {
            response: `Heading to the daily check-in page! 📅`,
            action: 'navigate',
            actionParams: { path: '/points' },
          };
        case 'logout':
          return {
            response: `Logging you out. See you later, ${name}! 👋`,
            action: 'logout',
          };
        case 'mystery-box':
          return {
            response: `Opening the Mystery Box! 🎁 Good luck!`,
            action: 'navigate',
            actionParams: { path: '/points' },
          };
      }
      break;
    }

    case 'SYSTEM': {
      if (parsed.action === 'time') {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        return {
          response: `It's currently **${timeStr}** on **${dateStr}**, ${name}.`,
        };
      }
      break;
    }

    case 'UNKNOWN':
    default: {
      return {
        response: `I'm not sure I understood that, ${name}. Could you rephrase?\n\nTry commands like:\n• "Open the menu"\n• "How do points work?"\n• "Write a confession"\n• "Search for songs"`,
      };
    }
  }

  return { response: `I'm not sure how to help with that, ${name}. Try asking me to navigate, search, or explain something!` };
}

// ─── POST Handler ────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    await dbConnect();
    const { message, userId } = (await req.json()) as { message: string; userId?: string };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    // Get user info for personalized responses
    let userName: string | null = null;
    if (userId) {
      const user = await User.findOne({ userId });
      if (user) userName = user.name;
    }

    // Parse the command
    const parsed = parseCommand(message);

    // Generate response
    const result = generateResponse(parsed, userName);

    return NextResponse.json({
      success: true,
      data: {
        response: result.response,
        intent: parsed.intent,
        action: result.action,
        actionParams: result.actionParams,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─── GET Handler (for status/health check) ───────────────────
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'online',
      name: 'JARVIS',
      version: '1.0.0',
      capabilities: ['NAVIGATION', 'SEARCH', 'INFORMATION', 'CREATION', 'ACTION', 'SYSTEM'],
      timestamp: new Date().toISOString(),
    },
  });
}
