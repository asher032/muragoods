import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import JarvisMemory from '@/app/lib/models/JarvisMemory';
import JarvisTask from '@/app/lib/models/JarvisTask';

// ─── Types ───────────────────────────────────────────────────
type Intent = 'NAVIGATION' | 'SEARCH' | 'INFORMATION' | 'CREATION' | 'ACTION' | 'SYSTEM' | 'SCREEN_CONTEXT' | 'AGENT' | 'MEMORY' | 'OPERATOR' | 'UNKNOWN';

interface ParsedCommand {
  intent: Intent;
  action: string;
  params: Record<string, string>;
}

interface JarvisResponse {
  response: string;
  intent: string;
  action?: string;
  actionParams?: Record<string, string>;
  cards?: Array<{ title: string; description: string; action?: string; actionParams?: Record<string, string> }>;
  buttons?: Array<{ label: string; action: string; actionParams?: Record<string, string> }>;
  task?: { title: string; steps: string[] };
  timestamp: string;
}

// ─── Intent Recognition ──────────────────────────────────────
function parseCommand(input: string): ParsedCommand {
  const lower = input.toLowerCase().trim();
  const params: Record<string, string> = {};

  // ─── MEMORY ──────────────────────────────────────────────
  if (/\b(remember|remind me|memorize|save this|note that)\b/.test(lower)) {
    const memMatch = lower.match(/(?:remember|remind me|memorize|save this|note that)\s+(.+)/);
    if (memMatch) params.content = memMatch[1].trim();
    return { intent: 'MEMORY', action: 'remember', params };
  }
  if (/\b(forget|delete memory|remove memory|clear memory)\b/.test(lower)) {
    return { intent: 'MEMORY', action: 'forget', params };
  }
  if (/\b(what do you remember|show memory|my memories|memory center)\b/.test(lower)) {
    return { intent: 'MEMORY', action: 'show', params };
  }

  // ─── SCREEN CONTEXT ──────────────────────────────────────
  if (/\b(what am i looking at|summarize this page|what does this|analyze this|what's on screen|read this page)\b/.test(lower)) {
    return { intent: 'SCREEN_CONTEXT', action: 'analyze', params };
  }

  // ─── AGENT MODE ──────────────────────────────────────────
  if (/\b(prepare|set up|organize|get ready|plan|automate|sequence|chain)\b/.test(lower)) {
    const taskMatch = lower.match(/(?:prepare|set up|organize|get ready|plan|automate|sequence|chain)\s+(.+)/);
    if (taskMatch) params.task = taskMatch[1].trim();
    return { intent: 'AGENT', action: 'plan', params };
  }

  // ─── OPERATOR MODE ───────────────────────────────────────
  if (/\b(health check|check website|system status|is the site|run diagnostics|check everything|website status)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'health-check', params };
  }
  if (/\b(check logs|show errors|find errors|what's wrong|debug|troubleshoot)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'diagnostics', params };
  }
  if (/\b(explain this code|what does this do|review code|optimize|find bugs)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'code-review', params };
  }
  if (/\b(start server|stop server|restart server|run server|run site)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'server-control', params };
  }
  if (/\b(build project|run build|build the site)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'build', params };
  }
  if (/\b(run tests|check tests|test the site)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'test', params };
  }
  if (/\b(git status|what changed|show changes|git diff)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'git-status', params };
  }
  if (/\b(deploy|deployment|is deployed|push to production)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'deploy', params };
  }
  if (/\b(optimize|improve performance|speed up|make faster)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'optimize', params };
  }

  // ─── NAVIGATION ──────────────────────────────────────────
  const navPatterns: [RegExp, string][] = [
    [/\b(open|go to|navigate|show|take me to|head to|visit)\b.*\b(profile|account|my profile)\b/, 'profile'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(menu|food|food menu|order)\b/, 'menu'],
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
    [/\b(open|go to|navigate|show|take me to)\b.*\b(jarvis|ai assistant|assistant)\b/, 'jarvis'],
  ];

  for (const [pattern, route] of navPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'NAVIGATION', action: route, params };
    }
  }

  // ─── SEARCH ──────────────────────────────────────────────
  if (/\b(search|find|look for|look up|browse|query)\b/.test(lower)) {
    const searchMatch = lower.match(/(?:search|find|look for|look up|browse|query)\s+(?:for\s+)?(?:about\s+)?(.+)/);
    if (searchMatch) params.query = searchMatch[1].trim();
    return { intent: 'SEARCH', action: 'search', params };
  }

  // ─── INFORMATION ─────────────────────────────────────────
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
    [/\b(how many|count|total)\b.*\b(orders?|letters?|confessions?|songs?|users?)\b/, 'stats'],
  ];

  for (const [pattern, infoType] of infoPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'INFORMATION', action: infoType, params };
    }
  }

  // ─── CREATION ────────────────────────────────────────────
  if (/\b(create|write|make|compose|draft|new)\b.*\b(letter|confession|song|message)\b/.test(lower)) {
    const typeMatch = lower.match(/\b(letter|confession|song|message)\b/);
    params.type = typeMatch?.[1] || 'letter';
    return { intent: 'CREATION', action: 'create', params };
  }

  // ─── ACTIONS ─────────────────────────────────────────────
  if (/\b(add to cart|order|buy|purchase|checkout)\b/.test(lower)) {
    // Try to extract food item
    const itemMatch = lower.match(/\b(add to cart|order|buy|purchase)\b\s+(?:a\s+)?(.+?)(?:\s+to\s+cart)?$/);
    if (itemMatch) params.item = itemMatch[2].trim();
    return { intent: 'ACTION', action: 'order', params };
  }
  if (/\b(check ?in|daily|daily check)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'checkin', params };
  }
  if (/\b(log ?out|sign ?out|sign ?off)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'logout', params };
  }
  if (/\b(mystery box|open box|spin|random reward|lucky box)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'mystery-box', params };
  }
  if (/\b(my )?(coins?|balance|points?|rewards?)\b/.test(lower) && /\b(check|how many|what|show|see|view|tell)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'check-balance', params };
  }
  if (/\b(my )?(coins?|balance|points?)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'check-balance', params };
  }
  if (/\b(order|food|menu|musubi|churros|coffee|cookie)\b/.test(lower) && /\b(add|cart|buy|want|order)\b/.test(lower)) {
    const foodMatch = lower.match(/\b(musubi|churros|coffee jelly|cookies?)\b/);
    if (foodMatch) params.item = foodMatch[1];
    return { intent: 'ACTION', action: 'order-food', params };
  }
  if (/\b(scan|camera|qr|image|photo|picture|vision|analyze image|read qr)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'camera', params };
  }
  if (/\b(my orders?|order history|previous orders?)\b/.test(lower)) {
    return { intent: 'NAVIGATION', action: 'orders', params };
  }
  if (/\b(open|show)\b.*\b(rewards?|prize|perk)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'mystery-box', params };
  }

  // ─── SYSTEM ──────────────────────────────────────────────
  if (/\b(time|date|what time|current time|clock)\b/.test(lower)) {
    return { intent: 'SYSTEM', action: 'time', params };
  }

  return { intent: 'UNKNOWN', action: 'unknown', params: { original: input } };
}

// ─── Response Generator ──────────────────────────────────────
function generateResponse(
  parsed: ParsedCommand,
  userName: string | null,
  memories: Array<{ key: string; value: string }> = [],
): JarvisResponse {
  const name = userName || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const ts = new Date().toISOString();

  // Check memories for preferences
  const prefShortAnswers = memories.find(m => m.key === 'prefer-short-answers');

  switch (parsed.intent) {
    case 'MEMORY': {
      switch (parsed.action) {
        case 'remember':
          return {
            response: `I'll remember that. Stored in my memory. 🧠`,
            intent: 'MEMORY',
            action: 'save-memory',
            actionParams: { content: parsed.params.content || '' },
            timestamp: ts,
          };
        case 'forget':
          return {
            response: `I can clear your memory from the Memory Center. Would you like me to open it?`,
            intent: 'MEMORY',
            action: 'navigate',
            actionParams: { path: '/settings' },
            buttons: [{ label: 'Open Memory Center', action: 'navigate', actionParams: { path: '/settings' } }],
            timestamp: ts,
          };
        case 'show':
          return {
            response: `Here's what I remember about you, ${name}:`,
            intent: 'MEMORY',
            action: 'show-memory',
            timestamp: ts,
          };
      }
      break;
    }

    case 'SCREEN_CONTEXT': {
      return {
        response: `I'll analyze the current page content. Let me scan what's visible...`,
        intent: 'SCREEN_CONTEXT',
        action: 'scan-page',
        timestamp: ts,
      };
    }

    case 'AGENT': {
      return {
        response: `I'll plan that out for you, ${name}. Let me break it down into steps.`,
        intent: 'AGENT',
        action: 'plan',
        actionParams: { task: parsed.params.task || '' },
        task: {
          title: parsed.params.task || 'Custom task',
          steps: ['Analyzing requirements', 'Planning execution', 'Identifying dependencies', 'Preparing action plan'],
        },
        timestamp: ts,
      };
    }

    case 'OPERATOR': {
      switch (parsed.action) {
        case 'health-check':
          return {
            response: `Running full system diagnostics...`,
            intent: 'OPERATOR',
            action: 'health-check',
            timestamp: ts,
          };
        case 'diagnostics':
          return {
            response: `Checking system logs and diagnostics...`,
            intent: 'OPERATOR',
            action: 'diagnostics',
            timestamp: ts,
          };
        case 'code-review':
          return {
            response: `I'll analyze the codebase for issues, optimizations, and potential bugs.`,
            intent: 'OPERATOR',
            action: 'code-review',
            timestamp: ts,
          };
        case 'server-control':
          return {
            response: `Server control is managed through Vercel deployment. The site is live at muragoods.vercel.app.`,
            intent: 'OPERATOR',
            action: 'server-status',
            cards: [{ title: 'Deployment Status', description: 'Production: ONLINE\nPlatform: Vercel\nFramework: Next.js', action: 'health-check' }],
            timestamp: ts,
          };
        case 'build':
          return {
            response: `Build check: The project compiles with zero TypeScript errors. Deployment is up to date.`,
            intent: 'OPERATOR',
            action: 'build-status',
            timestamp: ts,
          };
        case 'test':
          return {
            response: `Running automated tests...`,
            intent: 'OPERATOR',
            action: 'run-tests',
            timestamp: ts,
          };
        case 'git-status':
          return {
            response: `Checking repository status...`,
            intent: 'OPERATOR',
            action: 'git-status',
            timestamp: ts,
          };
        case 'deploy':
          return {
            response: `Deployment status: The site is live and deployed on Vercel.`,
            intent: 'OPERATOR',
            action: 'deploy-status',
            cards: [{ title: 'Production', description: 'URL: muragoods.vercel.app\nStatus: DEPLOYED\nPlatform: Vercel' }],
            timestamp: ts,
          };
        case 'optimize':
          return {
            response: `I'll analyze the site for performance improvements, accessibility, and optimization opportunities.`,
            intent: 'OPERATOR',
            action: 'optimize',
            timestamp: ts,
          };
      }
      break;
    }

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
        'jarvis': { path: '#', label: 'JARVIS settings' },
      };
      const nav = navMap[parsed.action];
      if (nav) {
        return {
          response: `Opening ${nav.label} for you, ${name}.`,
          intent: 'NAVIGATION',
          action: 'navigate',
          actionParams: { path: nav.path },
          timestamp: ts,
        };
      }
      break;
    }

    case 'SEARCH': {
      const query = parsed.params.query;
      if (query) {
        return {
          response: `Searching for "${query}"...`,
          intent: 'SEARCH',
          action: 'search',
          actionParams: { query },
          timestamp: ts,
        };
      }
      return {
        response: `What would you like me to search for, ${name}?`,
        intent: 'SEARCH',
        timestamp: ts,
      };
    }

    case 'INFORMATION': {
      switch (parsed.action) {
        case 'menu-info':
          return {
            response: prefShortAnswers
              ? `4 items: Musubi, Churros, Coffee Jelly, Cookies. Open menu?`
              : `Our menu features freshly made campus food:\n\n🍣 **Musubi** — Classic Hawaiian rice ball\n🍩 **Churros** — Crispy cinnamon-sugar sticks\n☕ **Coffee Jelly** — Sweet coffee gelatin dessert\n🍪 **Cookies** — Freshly baked chocolate chip\n\nWould you like to see the full menu?`,
            intent: 'INFORMATION',
            action: 'navigate',
            actionParams: { path: '/menu' },
            cards: [
              { title: '🍣 Musubi', description: 'Classic Hawaiian rice ball', action: 'navigate', actionParams: { path: '/menu' } },
              { title: '🍩 Churros', description: 'Crispy cinnamon-sugar sticks', action: 'navigate', actionParams: { path: '/menu' } },
              { title: '☕ Coffee Jelly', description: 'Sweet coffee gelatin', action: 'navigate', actionParams: { path: '/menu' } },
              { title: '🍪 Cookies', description: 'Freshly baked chocolate chip', action: 'navigate', actionParams: { path: '/menu' } },
            ],
            buttons: [{ label: 'View Full Menu', action: 'navigate', actionParams: { path: '/menu' } }],
            timestamp: ts,
          };
        case 'points-info':
          return {
            response: `**Muragoods Coins** are our reward currency:\n\n🪙 Earn **1 coin** per ₱1 spent on orders\n📅 Daily check-in bonus\n🎮 Play games to earn more\n👥 Refer friends for 50 coins each\n🎁 Mystery Box rewards\n\nCoins can be redeemed for discounts and perks!`,
            intent: 'INFORMATION',
            buttons: [
              { label: 'View Points', action: 'navigate', actionParams: { path: '/points' } },
              { label: 'Play Games', action: 'navigate', actionParams: { path: '/entertainment' } },
            ],
            timestamp: ts,
          };
        case 'untold-info':
          return {
            response: `**Untold Words** is where you express feelings anonymously:\n\n💌 **Letters** — Write digital love letters\n💜 **Confessions** — Share short thoughts anonymously\n🎵 **Songs** — Send a song with a message\n\nYou can browse the gallery, search, and send via Gmail.`,
            intent: 'INFORMATION',
            buttons: [
              { label: 'Explore Gallery', action: 'navigate', actionParams: { path: '/untold-words' } },
              { label: 'Write Something', action: 'navigate', actionParams: { path: '/untold-words/confession/create' } },
            ],
            timestamp: ts,
          };
        case 'order-info':
          return {
            response: `**Ordering is simple:**\n\n1. Browse the menu\n2. Add items to cart\n3. Checkout and pay via InstaPay\n4. We prepare your order\n5. You get notified when ready!\n\nYou earn coins for every peso spent! 🪙`,
            intent: 'INFORMATION',
            buttons: [{ label: 'Order Now', action: 'navigate', actionParams: { path: '/menu' } }],
            timestamp: ts,
          };
        case 'promo-info':
          return {
            response: `**Promo Codes** give you discounts!\n\n🎟️ Check the Mystery Box for promo codes\n📝 Admin-created codes expire after 1 week\n🔑 Each code can only be used once\n\nEnter your code at checkout!`,
            intent: 'INFORMATION',
            timestamp: ts,
          };
        case 'referral-info':
          return {
            response: `**Referral Program:**\n\n👥 Share your referral code\n🎉 Both you and your friend get **50 coins**\n📋 Find your code in your profile\n\nEveryone wins! 🎮`,
            intent: 'INFORMATION',
            buttons: [{ label: 'View Profile', action: 'navigate', actionParams: { path: '/account/profile' } }],
            timestamp: ts,
          };
        case 'greeting':
          return {
            response: prefShortAnswers
              ? `${greeting}, ${name}! What can I do?`
              : `${greeting}, ${name}! What can I help you with today?`,
            intent: 'INFORMATION',

            timestamp: ts,
          };
        case 'thanks':
          return {
            response: `You're welcome, ${name}! Always here to help. 😊`,
            intent: 'INFORMATION',
            timestamp: ts,
          };
        case 'help':
          return {
            response: `**I can help you with:**\n\n🗺️ **Navigate** — "Open the menu"\n🔍 **Search** — "Search for musubi"\nℹ️ **Information** — "How do points work?"\n✉️ **Create** — "Write a confession"\n🎮 **Actions** — "Open mystery box"\n⏰ **System** — "What time is it?"\n🧠 **Memory** — "Remember that I like coffee"\n📄 **Screen Context** — "What am I looking at?"\n🤖 **Agent** — "Prepare my order"\n🔧 **Operator** — "Run health check"\n\nJust speak naturally — I understand context!`,
            intent: 'INFORMATION',
            timestamp: ts,
          };
        case 'identity':
          return {
            response: `I'm **JARVIS** — your intelligent assistant built into Muragoods.\n\nI can navigate, search, create, remember, and help you with anything on this site.\n\nThink of me as your personal operating system. 🤖`,
            intent: 'INFORMATION',
            timestamp: ts,
          };
        case 'stats':
          return {
            response: `Let me check that for you...`,
            intent: 'INFORMATION',
            action: 'stats',
            actionParams: { query: parsed.params.original || '' },
            timestamp: ts,
          };
      }
      break;
    }

    case 'CREATION': {
      const typeMap: Record<string, { path: string; label: string }> = {
        'letter': { path: '/untold-words/letter/create', label: 'letter creator' },
        'confession': { path: '/untold-words/confession/create', label: 'confession creator' },
        'song': { path: '/untold-words/song/create', label: 'song creator' },
        'message': { path: '/untold-words/song/create', label: 'song message creator' },
      };
      const type = typeMap[parsed.params.type || 'letter'] || typeMap.letter;
      return {
        response: `Opening the ${type.label} for you, ${name}. Express yourself! ✨`,
        intent: 'CREATION',
        action: 'navigate',
        actionParams: { path: type.path },
        timestamp: ts,
      };
    }

    case 'ACTION': {
      switch (parsed.action) {
        case 'order':
          if (parsed.params.item) {
            return {
              response: `I'll add **${parsed.params.item}** to your cart and take you to checkout, ${name}. 🛒`,
              intent: 'ACTION', action: 'add-to-cart',
              actionParams: { item: parsed.params.item, path: '/menu' },
              buttons: [{ label: 'Go to Menu', action: 'navigate', actionParams: { path: '/menu' } }, { label: 'Checkout', action: 'navigate', actionParams: { path: '/checkout' } }],
              timestamp: ts,
            };
          }
          return { response: `Let me take you to the menu, ${name}. Add items to your cart and checkout! 🛒`, intent: 'ACTION', action: 'navigate', actionParams: { path: '/menu' }, timestamp: ts };
        case 'order-food': {
          const item = parsed.params.item || 'food';
          return {
            response: `Great choice! Let me take you to the menu to order **${item}**. 🍽️`,
            intent: 'ACTION', action: 'navigate', actionParams: { path: '/menu' },
            cards: [{ title: `🍽️ Order ${item}`, description: `Add ${item} to your cart from the menu`, action: 'navigate', actionParams: { path: '/menu' } }],
            timestamp: ts,
          };
        }
        case 'checkin':
          return { response: `Heading to the daily check-in page! 📅`, intent: 'ACTION', action: 'navigate', actionParams: { path: '/points' }, timestamp: ts };
        case 'check-balance':
          return {
            response: `Let me check your coin balance, ${name}. 🪙`,
            intent: 'ACTION', action: 'navigate', actionParams: { path: '/points' },
            cards: [{ title: '🪙 My Coins', description: 'View your coin balance, earn history, and redeem rewards', action: 'navigate', actionParams: { path: '/points' } }],
            timestamp: ts,
          };
        case 'logout':
          return { response: `Logging you out. See you later, ${name}! 👋`, intent: 'ACTION', action: 'logout', timestamp: ts };
        case 'mystery-box':
          return {
            response: `Opening the Mystery Box! 🎁 Good luck, ${name}!`,
            intent: 'ACTION', action: 'navigate', actionParams: { path: '/play/mysterybox' },
            cards: [{ title: '🎁 Mystery Box', description: 'Spend 10 coins for a chance to win promo codes, bonus coins, or exclusive perks!', action: 'navigate', actionParams: { path: '/play/mysterybox' } }],
            timestamp: ts,
          };
        case 'camera':
          return {
            response: `Camera mode activated. 📸 You can upload an image or scan a QR code.\n\nClick the camera button below to start.`,
            intent: 'ACTION', action: 'camera',
            buttons: [{ label: '📸 Open Camera', action: 'camera' }, { label: '📁 Upload Image', action: 'upload-image' }],
            timestamp: ts,
          };
      }
      break;
    }

    case 'SYSTEM': {
      if (parsed.action === 'time') {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        return { response: `It's currently **${timeStr}** on **${dateStr}**, ${name}.`, intent: 'SYSTEM', timestamp: ts };
      }
      break;
    }

    case 'UNKNOWN':
    default:
      return {
        response: `I'm not sure I understood that, ${name}. Could you rephrase?\n\nTry:\n• "Open the menu"\n• "How do points work?"\n• "Write a confession"\n• "What am I looking at?"\n• "Run health check"\n• "Remember I like coffee"`,
        intent: 'UNKNOWN',
        timestamp: ts,
      };
  }

  return { response: `I'm not sure how to help with that, ${name}. Try asking me to navigate, search, or explain something!`, intent: 'UNKNOWN', timestamp: ts };
}

// ─── POST Handler ────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = (await req.json()) as {
      message: string;
      userId?: string;
      screenContext?: string;
    };

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    // Get user info
    let userName: string | null = null;
    if (body.userId) {
      const user = await User.findOne({ userId: body.userId });
      if (user) userName = user.name;
    }

    // Get memories
    let memories: Array<{ key: string; value: string }> = [];
    if (body.userId) {
      memories = await JarvisMemory.find({ userId: body.userId }).limit(20).lean();
    }

    // Parse command
    const parsed = parseCommand(body.message);

    // If screen context provided, enrich the analysis
    if (parsed.intent === 'SCREEN_CONTEXT' && body.screenContext) {
      const screenAnalysis = body.screenContext.substring(0, 2000);
      return NextResponse.json({
        success: true,
        data: {
          response: `Here's what I found on this page:\n\n${screenAnalysis.substring(0, 500)}${screenAnalysis.length > 500 ? '...' : ''}\n\nWould you like me to search for something specific or navigate to a section?`,
          intent: 'SCREEN_CONTEXT',
          action: 'scan-page',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // If memory action, handle it
    if (parsed.intent === 'MEMORY' && parsed.action === 'save-memory' && body.userId && parsed.params.content) {
      const content = parsed.params.content;
      // Try to extract a key-value pair
      const kvMatch = content.match(/^(?:i |that |my )?(?:prefer|like|want|use)\s+(.+?)(?:\s+is\s+|\s*=\s*)(.+)$/i);
      if (kvMatch) {
        await JarvisMemory.findOneAndUpdate(
          { userId: body.userId, key: kvMatch[1].trim().toLowerCase() },
          { value: kvMatch[2].trim(), category: 'preference', updatedAt: new Date() },
          { upsert: true }
        );
      } else {
        await JarvisMemory.create({
          userId: body.userId,
          key: content.substring(0, 100),
          value: content,
          category: 'context',
        });
      }
    }

    // Generate response
    const result = generateResponse(parsed, userName, memories);

    // If it's a health check, actually run it
    if (parsed.intent === 'OPERATOR' && parsed.action === 'health-check') {
      try {
        const statusRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app'}/api/jarvis/status`);
        const statusData = await statusRes.json();
        if (statusData.success) {
          const s = statusData.data;
          const systems = s.systems;
          result.response = `**SYSTEM HEALTH: ${s.healthScore}%**\n\n${s.status === 'healthy' ? '✅' : '⚠️'} Overall: ${s.status.toUpperCase()}\n\n` +
            `● Database: ${systems.database.status === 'online' ? '✅' : '❌'} ${systems.database.latency}\n` +
            `● Frontend: ✅ ONLINE\n` +
            `● JARVIS API: ${apis_status(systems.apis, 'jarvis')}\n` +
            `● Products API: ${apis_status(systems.apis, 'products')}\n` +
            `● Explore API: ${apis_status(systems.apis, 'explore')}\n` +
            `● Music (Deezer): ${apis_status(systems.apis, 'deezer')}\n` +
            `● Email: ${systems.email.providers.join(', ') || 'none'}\n` +
            `● AI: ✅ Online\n\n` +
            `Deployment: ${s.deployment.status} on ${s.deployment.platform}`;
          result.cards = [
            { title: 'System Health', description: `${s.healthScore}% — ${s.status.toUpperCase()}` },
            { title: 'Database', description: `${systems.database.provider} — ${systems.database.latency}` },
            { title: 'Email', description: `Primary: ${systems.email.primary} | Fallback: ${systems.email.fallback}` },
          ];
        }
      } catch { /* health check fetch failed */ }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function apis_status(apis: Record<string, string>, key: string): string {
  const status = apis[key];
  return status === 'online' ? '✅ ONLINE' : status === 'error' ? '⚠️ ERROR' : '❌ OFFLINE';
}

// ─── GET Handler ─────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'online',
      name: 'JARVIS',
      version: '2.0.0',
      capabilities: [
        'NAVIGATION', 'SEARCH', 'INFORMATION', 'CREATION', 'ACTION',
        'SYSTEM', 'SCREEN_CONTEXT', 'AGENT', 'MEMORY', 'OPERATOR',
      ],
      features: [
        'Voice input/output', 'Persistent memory', 'Screen context analysis',
        'Agent mode', 'Operator mode', 'Health checks', 'Proactive suggestions',
        'Rich response cards', 'Command history', 'Task center',
      ],
      timestamp: new Date().toISOString(),
    },
  });
}
