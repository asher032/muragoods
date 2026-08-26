import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import JarvisMemory from '@/app/lib/models/JarvisMemory';
import { askGemini, clearGeminiHistory } from '@/lib/jarvis-gemini';
import { generateSpeech } from '@/lib/jarvis-tts';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

// ─── Types ───────────────────────────────────────────────────
type Intent = 'NAVIGATION' | 'SEARCH' | 'INFORMATION' | 'CREATION' | 'ACTION' | 'SYSTEM' | 'SCREEN_CONTEXT' | 'AGENT' | 'MEMORY' | 'OPERATOR' | 'CODE_EDIT' | 'MANAGE' | 'UNKNOWN';

interface JarvisResponse {
  response: string;
  intent: string;
  action?: string;
  actionParams?: Record<string, string>;
  cards?: Array<{ title: string; description: string; action?: string; actionParams?: Record<string, string> }>;
  buttons?: Array<{ label: string; action: string; actionParams?: Record<string, string> }>;
  task?: { title: string; steps: string[] };
  tts?: string; // Base64 audio for ElevenLabs
  timestamp: string;
}

// ─── Command Parsing (Fast pattern matching) ─────────────────
function parseCommand(input: string): { intent: Intent; action: string; params: Record<string, string> } {
  const lower = input.toLowerCase().trim();
  const params: Record<string, string> = {};

  // ─── MEMORY ──────────────────────────────────────────────
  if (/\b(remember|remind me|memorize|save this|note that)\b/.test(lower)) {
    const m = lower.match(/(?:remember|remind me|memorize|save this|note that)\s+(.+)/);
    if (m) params.content = m[1].trim();
    return { intent: 'MEMORY', action: 'remember', params };
  }
  if (/\b(forget|delete memory|clear memory)\b/.test(lower)) {
    return { intent: 'MEMORY', action: 'forget', params };
  }
  if (/\b(my memories|show memory|memory center)\b/.test(lower)) {
    return { intent: 'MEMORY', action: 'show', params };
  }

  // ─── SCREEN CONTEXT ──────────────────────────────────────
  if (/\b(what am i looking at|summarize this page|analyze this|what's on screen)\b/.test(lower)) {
    return { intent: 'SCREEN_CONTEXT', action: 'analyze', params };
  }

  // ─── CODE EDITING (admin only) ───────────────────────────
  if (/\b(edit|modify|change|update|fix|rewrite|improve)\b.*\b(file|code|component|page|style|css|layout)\b/.test(lower)) {
    const fileMatch = lower.match(/(?:file|code|component|page|style|css|layout)\s+(\S+)/);
    if (fileMatch) params.file = fileMatch[1];
    params.instruction = input;
    return { intent: 'CODE_EDIT', action: 'edit-file', params };
  }
  if (/\b(read|show|open|view|inspect|check)\b.*\b(file|code|component|page)\b/.test(lower)) {
    const fileMatch = lower.match(/(?:file|code|component|page)\s+(\S+)/);
    if (fileMatch) params.file = fileMatch[1];
    return { intent: 'CODE_EDIT', action: 'read-file', params };
  }
  if (/\b(analyze|review|audit|find bugs?|optimize)\b.*\b(code|file|component|page)\b/.test(lower)) {
    const fileMatch = lower.match(/(?:code|file|component|page)\s+(\S+)/);
    if (fileMatch) params.file = fileMatch[1];
    return { intent: 'CODE_EDIT', action: 'analyze-code', params };
  }

  // ─── WEBSITE MANAGEMENT (admin only) ─────────────────────
  if (/\b(list|show|get|view)\b.*\b(users?|members?|accounts?)\b/.test(lower)) {
    return { intent: 'MANAGE', action: 'list-users', params };
  }
  if (/\b(user|site|website)\b.*\b(stats?|analytics|numbers|counts?)\b/.test(lower)) {
    return { intent: 'MANAGE', action: 'site-stats', params };
  }
  if (/\b(update|change|set|give|add)\b.*\b(coins?|points?|balance)\b/.test(lower)) {
    const coinMatch = lower.match(/(\d+)/);
    const userMatch = lower.match(/(?:to|for)\s+(\S+)/);
    if (coinMatch) params.coins = coinMatch[1];
    if (userMatch) params.userId = userMatch[1];
    return { intent: 'MANAGE', action: 'update-coins', params };
  }
  if (/\b(delete|remove|ban)\b.*\b(user|member|account)\b/.test(lower)) {
    const userMatch = lower.match(/(?:user|member|account)\s+(\S+)/);
    if (userMatch) params.userId = userMatch[1];
    return { intent: 'MANAGE', action: 'delete-user', params };
  }
  if (/\b(add|create|new)\b.*\b(menu item|product|food item)\b/.test(lower)) {
    params.instruction = input;
    return { intent: 'MANAGE', action: 'add-product', params };
  }

  // ─── OPERATOR ────────────────────────────────────────────
  if (/\b(health check|check website|system status|run diagnostics)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'health-check', params };
  }
  if (/\b(check logs|show errors|find bugs|debug|troubleshoot)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'diagnostics', params };
  }
  if (/\b(deploy|push to production)\b/.test(lower)) {
    return { intent: 'OPERATOR', action: 'deploy', params };
  }

  // ─── NAVIGATION ──────────────────────────────────────────
  const navPatterns: [RegExp, string, string][] = [
    [/\b(open|go to|navigate|show|take me to)\b.*\b(profile|account|my profile)\b/, 'profile', '/account/profile'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(menu|food|food menu|order)\b/, 'menu', '/menu'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(letters?|untold|confession|anonymous)\b/, 'untold-words', '/untold-words'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(rewards?|points?|coins?|my points)\b/, 'points', '/points'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(orders?|my orders?|order history)\b/, 'orders', '/orders'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(home|main|landing)\b/, 'home', '/'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(games?|play|entertainment|fun)\b/, 'entertainment', '/entertainment'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(checkout|cart|pay)\b/, 'checkout', '/checkout'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(support|help|contact)\b/, 'support', '/support'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(settings?|preferences)\b/, 'settings', '/settings'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(admin|dashboard|panel)\b/, 'admin', '/admin'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(my submissions?|my letters?)\b/, 'my-submissions', '/untold-words/my'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(song|send a song)\b/, 'song-create', '/untold-words/song/create'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(confession|write confession)\b/, 'confession-create', '/untold-words/confession/create'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(letter|write letter)\b/, 'letter-create', '/untold-words/letter/create'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(mystery box|lucky box)\b/, 'mystery-box', '/play/mysterybox'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(flappy|bird)\b/, 'flappy', '/play/flappy'],
    [/\b(open|go to|navigate|show|take me to)\b.*\b(memory game|memory match)\b/, 'memory', '/play/memory'],
  ];
  for (const [pattern, , path] of navPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'NAVIGATION', action: 'navigate', params: { path } };
    }
  }

  // ─── SEARCH ──────────────────────────────────────────────
  if (/\b(search|find|look for|browse)\b/.test(lower)) {
    const m = lower.match(/(?:search|find|look for|browse)\s+(?:for\s+)?(.+)/);
    if (m) params.query = m[1].trim();
    return { intent: 'SEARCH', action: 'search', params };
  }

  // ─── ACTIONS ─────────────────────────────────────────────
  if (/\b(mystery box|open box|spin|lucky box)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'mystery-box', params };
  }
  if (/\b(my )?(coins?|balance|points?)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'check-balance', params };
  }
  if (/\b(order|buy|add to cart)\b/.test(lower)) {
    const itemMatch = lower.match(/(?:order|buy|add)\s+(?:a\s+)?(.+?)(?:\s+to\s+cart)?$/);
    if (itemMatch) params.item = itemMatch[1].trim();
    return { intent: 'ACTION', action: 'order', params };
  }
  if (/\b(scan|camera|qr|image|vision)\b/.test(lower)) {
    return { intent: 'ACTION', action: 'camera', params };
  }

  // ─── SYSTEM ──────────────────────────────────────────────
  if (/\b(time|date|what time|clock)\b/.test(lower)) {
    return { intent: 'SYSTEM', action: 'time', params };
  }
  if (/\b(weather|temperature|forecast|rain|sunny)\b/.test(lower)) {
    const cityMatch = lower.match(/(?:weather|temperature|forecast)\s+(?:in|at|for)?\s*(.+)/);
    params.city = cityMatch?.[1]?.trim() || 'Manila';
    return { intent: 'SYSTEM', action: 'weather', params };
  }
  if (/\b(clear chat|clear history|reset conversation|start over)\b/.test(lower)) {
    return { intent: 'SYSTEM', action: 'clear-history', params };
  }

  // ─── COMMON QUERIES (let AI handle) ──────────────────────
  if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/.test(lower)) {
    return { intent: 'INFORMATION', action: 'greeting', params };
  }
  if (/^(help|what can you do|capabilities|commands)$/.test(lower)) {
    return { intent: 'INFORMATION', action: 'help', params };
  }
  if (/^(who are you|what are you|your name)$/.test(lower)) {
    return { intent: 'INFORMATION', action: 'identity', params };
  }
  if (/^(thanks?|thank you|ty|thx)$/.test(lower)) {
    return { intent: 'INFORMATION', action: 'thanks', params };
  }

  return { intent: 'UNKNOWN', action: 'unknown', params: { original: input } };
}

// ─── Quick Response Generator ────────────────────────────────
function quickResponse(parsed: { intent: Intent; action: string; params: Record<string, string> }, userName: string | null): JarvisResponse {
  const name = userName || 'there';
  const ts = new Date().toISOString();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  switch (parsed.intent) {
    case 'NAVIGATION':
      return { response: `Opening that for you, ${name}.`, intent: 'NAVIGATION', action: 'navigate', actionParams: { path: parsed.params.path || '/' }, timestamp: ts };
    case 'SEARCH':
      return { response: `Searching for "${parsed.params.query}"...`, intent: 'SEARCH', action: 'search', actionParams: { query: parsed.params.query || '' }, timestamp: ts };
    case 'ACTION':
      if (parsed.action === 'mystery-box') return { response: `Opening the Mystery Box! 🎁`, intent: 'ACTION', action: 'navigate', actionParams: { path: '/play/mysterybox' }, timestamp: ts };
      if (parsed.action === 'check-balance') return { response: `Checking your coin balance, ${name}.`, intent: 'ACTION', action: 'navigate', actionParams: { path: '/points' }, timestamp: ts };
      if (parsed.action === 'camera') return { response: `Camera mode activated. 📸`, intent: 'ACTION', action: 'camera', timestamp: ts };
      if (parsed.action === 'order') return { response: `Let me take you to the menu.`, intent: 'ACTION', action: 'navigate', actionParams: { path: '/menu' }, timestamp: ts };
      return { response: `Processing action...`, intent: 'ACTION', timestamp: ts };
    case 'MEMORY':
      if (parsed.action === 'remember') return { response: `I'll remember that. 🧠`, intent: 'MEMORY', action: 'save-memory', actionParams: { content: parsed.params.content || '' }, timestamp: ts };
      if (parsed.action === 'show') return { response: `Here are your memories:`, intent: 'MEMORY', action: 'show-memory', timestamp: ts };
      return { response: `Memory cleared.`, intent: 'MEMORY', action: 'forget', timestamp: ts };
    case 'SCREEN_CONTEXT':
      return { response: `Analyzing the current page...`, intent: 'SCREEN_CONTEXT', action: 'scan-page', timestamp: ts };
    case 'CODE_EDIT':
      return { response: `I'll handle that code change.`, intent: 'CODE_EDIT', action: parsed.action, actionParams: parsed.params, timestamp: ts };
    case 'MANAGE':
      return { response: `Accessing management tools...`, intent: 'MANAGE', action: parsed.action, actionParams: parsed.params, timestamp: ts };
    case 'OPERATOR':
      if (parsed.action === 'health-check') return { response: `Running diagnostics...`, intent: 'OPERATOR', action: 'health-check', timestamp: ts };
      if (parsed.action === 'deploy') return { response: `Checking deployment...`, intent: 'OPERATOR', action: 'deploy', timestamp: ts };
      return { response: `Processing operator command...`, intent: 'OPERATOR', action: parsed.action, timestamp: ts };
    case 'SYSTEM':
      if (parsed.action === 'time') {
        const now = new Date();
        return { response: `It's ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`, intent: 'SYSTEM', timestamp: ts };
      }
      if (parsed.action === 'clear-history') return { response: `Clearing conversation...`, intent: 'SYSTEM', action: 'clear-history', timestamp: ts };
      if (parsed.action === 'weather') return { response: `Checking weather...`, intent: 'SYSTEM', action: 'weather', actionParams: { city: parsed.params.city || 'Manila' }, timestamp: ts };
      return { response: `Processing...`, intent: 'SYSTEM', action: parsed.action, timestamp: ts };
    case 'INFORMATION':
      if (parsed.action === 'greeting') return { response: `${greeting}, ${name}! How can I help?`, intent: 'INFORMATION', timestamp: ts };
      if (parsed.action === 'help') return { response: `I can navigate, search, create content, manage your account, edit code, and more. Just speak naturally!`, intent: 'INFORMATION', timestamp: ts };
      if (parsed.action === 'identity') return { response: `I'm JARVIS — your intelligent AI assistant. I can navigate, search, create, edit code, manage the website, and think autonomously.`, intent: 'INFORMATION', timestamp: ts };
      if (parsed.action === 'thanks') return { response: `Always here to help, ${name}. 😊`, intent: 'INFORMATION', timestamp: ts };
      return { response: `Let me look into that.`, intent: 'INFORMATION', timestamp: ts };
    default:
      return { response: `Thinking...`, intent: 'UNKNOWN', timestamp: ts };
  }
}

// ─── POST Handler ────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = (await req.json()) as {
      message: string;
      userId?: string;
      screenContext?: string;
      email?: string;
    };

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ success: false, error: 'Message required' }, { status: 400 });
    }

    const isAdminUser = !!body.email && ADMIN_EMAILS.includes(body.email);

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

    // Parse command (fast pattern matching)
    const parsed = parseCommand(body.message);

    // Quick response for known intents
    let result = quickResponse(parsed, userName);

    // For unknown/complex queries, use Gemini AI
    if (parsed.intent === 'UNKNOWN' || (parsed.intent === 'INFORMATION' && !['greeting', 'help', 'identity', 'thanks'].includes(parsed.action))) {
      const aiResult = await askGemini(body.message, body.userId, body.screenContext || undefined, userName || undefined, isAdminUser);
      if (aiResult.isAI && aiResult.response) {
        result.response = aiResult.response;
        result.intent = 'INFORMATION';
        if (aiResult.action && aiResult.actionParams) {
          result.action = aiResult.action;
          result.actionParams = aiResult.actionParams;
        }
      }
    }

    // Handle memory save
    if (parsed.intent === 'MEMORY' && parsed.action === 'remember' && body.userId && parsed.params.content) {
      const content = parsed.params.content;
      const kvMatch = content.match(/^(?:i |that |my )?(?:prefer|like|want|use)\s+(.+?)(?:\s+is\s+|\s*=\s*)(.+)$/i);
      if (kvMatch) {
        await JarvisMemory.findOneAndUpdate(
          { userId: body.userId, key: kvMatch[1].trim().toLowerCase() },
          { value: kvMatch[2].trim(), category: 'preference', updatedAt: new Date() },
          { upsert: true },
        );
      } else {
        await JarvisMemory.create({ userId: body.userId, key: content.substring(0, 100), value: content, category: 'context' });
      }
    }

    // Handle clear history
    if (parsed.intent === 'SYSTEM' && parsed.action === 'clear-history') {
      clearGeminiHistory(body.userId);
      result.response = `Conversation cleared. Starting fresh, ${userName || 'Commander'}.`;
    }

    // Handle weather
    if (parsed.intent === 'SYSTEM' && parsed.action === 'weather') {
      // Gemini can answer weather — it's already handled by AI if needed
      const city = parsed.params.city || 'Manila';
      result.response = `Weather for ${city}: Let me check...`;
    }

    // Handle health check
    if (parsed.intent === 'OPERATOR' && parsed.action === 'health-check') {
      try {
        const statusRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app'}/api/jarvis/status`);
        const statusData = await statusRes.json();
        if (statusData.success) {
          const s = statusData.data;
          result.response = `**SYSTEM HEALTH: ${s.healthScore}%**\n\n${s.status === 'healthy' ? '✅' : '⚠️'} Overall: ${s.status.toUpperCase()}\n\n` +
            `● Database: ${s.systems.database.status === 'online' ? '✅' : '❌'} ${s.systems.database.latency}\n` +
            `● Frontend: ✅ ONLINE\n` +
            `● Email: ${s.systems.email.providers.join(', ') || 'none'}\n` +
            `● AI: ✅ Gemini 3.6 Flash\n` +
            `● TTS: ✅ ElevenLabs\n\n` +
            `Deployment: ${s.deployment.status} on ${s.deployment.platform}`;
          result.cards = [
            { title: 'System Health', description: `${s.healthScore}% — ${s.status.toUpperCase()}` },
            { title: 'Database', description: `${s.systems.database.provider} — ${s.systems.database.latency}` },
            { title: 'Email', description: `Primary: ${s.systems.email.primary}` },
          ];
        }
      } catch { /* empty */ }
    }

    // Handle code editing
    if (parsed.intent === 'CODE_EDIT' && isAdminUser) {
      const { action, params } = parsed;
      const rootDir = process.cwd();

      if (action === 'read-file' && params.file) {
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const content = await readFile(join(rootDir, params.file), 'utf-8').catch(() => null);
        if (content) {
          result.response = `**${params.file}** (${content.split('\n').length} lines):\n\n\`\`\`\n${content.substring(0, 1500)}\n\`\`\``;
        } else {
          result.response = `File not found: ${params.file}`;
        }
      } else if (action === 'analyze-code' && params.file) {
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const { analyzeCode } = await import('@/lib/jarvis-gemini');
        const content = await readFile(join(rootDir, params.file), 'utf-8').catch(() => null);
        if (content) {
          const analysis = await analyzeCode(content, 'Analyze this code for bugs, improvements, and best practices. Be concise.');
          result.response = `**Code Analysis — ${params.file}:**\n\n${analysis}`;
        } else {
          result.response = `File not found: ${params.file}`;
        }
      } else if (action === 'edit-file') {
        result.response = `I'll edit that file. Please provide the specific instruction for the change you want.`;
        result.buttons = [{ label: 'Confirm Edit', action: 'code-edit-confirm', actionParams: params }];
      }
    }

    // Handle website management
    if (parsed.intent === 'MANAGE' && isAdminUser) {
      try {
        const manageRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app'}/api/jarvis/manage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: body.email, action: parsed.action, params: parsed.params }),
        });
        const manageData = await manageRes.json();
        if (manageData.success) {
          const d = manageData.data;
          if (parsed.action === 'list-users') {
            result.response = `**${d.count} Users:**\n\n${d.users.map((u: { name: string; email: string; coins: number }) => `• ${u.name} (${u.email}) — ${u.coins} coins`).join('\n')}`;
          } else if (parsed.action === 'site-stats') {
            result.response = `**Site Stats:**\n\n👥 Total Users: ${d.totalUsers}\n🪙 Total Coins: ${d.totalCoins}\n⏱️ Uptime: ${Math.round(d.uptime)}s\n💾 Memory: ${d.memoryUsage}`;
          } else if (parsed.action === 'update-user-coins') {
            result.response = `Updated **${d.name}**'s coins to ${d.coins}. ✅`;
          } else if (parsed.action === 'delete-user') {
            result.response = `Deleted user **${d.deleted}**. ✅`;
          }
        } else {
          result.response = `Management error: ${manageData.error}`;
        }
      } catch {
        result.response = `Could not reach management API.`;
      }
    }

    // Generate ElevenLabs TTS audio
    try {
      const ttsResult = await generateSpeech(result.response);
      if (ttsResult.success && ttsResult.audioBase64) {
        result.tts = ttsResult.audioBase64;
      }
    } catch { /* TTS is optional */ }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'JARVIS error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─── GET Handler ─────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'online',
      name: 'JARVIS',
      version: '4.0.0',
      ai: 'Gemini 3.6 Flash',
      tts: 'ElevenLabs',
      capabilities: [
        'NAVIGATION', 'SEARCH', 'INFORMATION', 'CREATION', 'ACTION',
        'SYSTEM', 'SCREEN_CONTEXT', 'AGENT', 'MEMORY', 'OPERATOR',
        'CODE_EDIT', 'MANAGE', 'AUTONOMOUS_REASONING', 'ELEVENLABS_TTS',
      ],
      timestamp: new Date().toISOString(),
    },
  });
}
