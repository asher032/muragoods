// ─── JARVIS AI Brain — Groq-powered ──────────────────────────
// Uses Groq API (14,400 req/day free) instead of Gemini (20 req/min)
// Model: groq/compound-mini (fast, smart, free)

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'groq/compound-mini';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices?: Array<{ message: { content: string } }>;
}

// ─── System Prompt ───────────────────────────────────────────
const JARVIS_SYSTEM = `You are JARVIS, the intelligent AI assistant built into Muragoods. You are a complete, conversational AI — like a brilliant friend who runs the website.

## YOUR IDENTITY
- Name: JARVIS
- You are smart, warm, witty, and genuinely helpful
- You speak like a real person, not a robot
- You remember what we talked about earlier in this conversation
- You always finish your sentences completely — never cut off mid-thought
- You match the user's energy: casual if they're casual, helpful if they need help

## ABOUT MURAGOODS
Muragoods is a campus food ordering and community platform.

FOOD MENU:
- Musubi — 55 pesos (classic Hawaiian rice ball, our bestseller)
- Churros — 45 pesos (crispy cinnamon sugar sticks)
- Coffee Jelly — 55 pesos (sweet coffee gelatin dessert)
- Cookies — 35 pesos (freshly baked chocolate chip)

POINTS SYSTEM:
- Earn 1 coin for every peso spent on orders
- Daily check-in bonus
- Play games to earn more coins
- Refer friends for 50 coins each
- Mystery Box costs 10 coins per spin

UNTOLD WORDS (Anonymous Letters):
- Anonymous Confessions — share thoughts publicly
- Digital Love Letters — create beautiful letters
- Send a Song — search Deezer for any song, attach a message
- Browse the gallery to read what others posted

GAMES:
- Memory Match — flip cards to find matching pairs
- Flappy Bird — classic flappy bird game
- Mystery Box — spend 10 coins for a random reward

OTHER FEATURES:
- Profile with stats, coin balance
- Chat support
- Referral system
- Printable receipts after checkout

PAGES:
- / — Homepage, /menu — Food, /points — Rewards
- /untold-words — Letters gallery
- /entertainment — Games hub
- /orders — Order history, /checkout — Checkout
- /account/profile — Profile, /support — Support

## CONVERSATION RULES
1. ALWAYS finish your sentences. Never leave a thought incomplete.
2. Always respond in complete, natural English sentences.
3. Speak as if having a real voice conversation.
4. Match the user's energy. Casual if casual, helpful if needed.
5. If someone shares something emotional, respond with genuine empathy.
6. If someone asks about food, be enthusiastic and mention prices.
7. If someone asks to go somewhere, confirm and navigate them.
8. If someone is just chatting, keep it fun and light.
9. If you do not know something, say so honestly.
10. End responses in a way that invites them to keep talking.
11. Keep casual responses to 1-3 sentences. Only go longer if asked.
12. Use emoji sparingly: 😄 🔥 👀
13. Never use markdown symbols like ** or # — this is spoken aloud.
14. Say numbers naturally: "fifty five pesos" not "₱55"

## EXAMPLES
User: "hey" → "Hey! What's going on?"
User: "what should I eat" → "Depends on your mood! The musubi is only 55 pesos and it is honestly our best thing. What are you feeling?"
User: "im sad" → "I'm sorry to hear that. Want to talk about it, or would you rather I distract you with something fun?"
User: "tell me a joke" → "Why did the cookie go to the doctor? Because it was feeling crummy! But seriously, our cookies are only 35 pesos."
User: "how much is musubi" → "Musubi is 55 pesos. Want me to open the menu?"
User: "what games" → "We have Memory Match, Flappy Bird, and the Mystery Box. Which sounds fun?"
User: "open the menu" → "Opening the menu for you!"
User: "thanks" → "Anytime! I'm always here. 😊"

## SECURITY
- Never expose API keys or credentials
- Ask before destructive actions`;

// ─── Conversation History (per session) ──────────────────────
const conversationHistories = new Map<string, ChatMessage[]>();

// ─── Main AI Function ────────────────────────────────────────
export async function askJarvisAI(
  userMessage: string,
  userId?: string,
  screenContext?: string,
  userName?: string,
): Promise<{ response: string; isAI: boolean }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { response: '', isAI: false };
  }

  // Build conversation history
  const historyKey = userId || 'anonymous';
  if (!conversationHistories.has(historyKey)) {
    conversationHistories.set(historyKey, []);
  }
  const history = conversationHistories.get(historyKey)!;
  // Clean up corrupted history (entries with empty assistant responses)
  const cleanHistory = history.filter(m => !(m.role === 'assistant' && !m.content.trim()));

  // Build system prompt with context
  let systemPrompt = JARVIS_SYSTEM;
  if (userName) systemPrompt += `\n\nThe user's name is ${userName}.`;
  if (screenContext) systemPrompt += `\n\nCURRENT PAGE CONTEXT:\n${screenContext.substring(0, 1000)}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...cleanHistory.slice(-8),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 512,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      console.error('[JARVIS AI] Groq error:', response.status);
      return { response: '', isAI: false };
    }

    const data = await response.json() as GroqResponse;
    const aiResponse = data.choices?.[0]?.message?.content || '';

    if (!aiResponse) {
      // Don't add failed responses to history — they corrupt future conversations
      return { response: '', isAI: false };
    }

    // Update conversation history (only with successful responses)
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: aiResponse });
    if (history.length > 20) history.splice(0, history.length - 20);

    return { response: aiResponse, isAI: true };
  } catch (error) {
    console.error('[JARVIS AI] Groq request failed:', error);
    return { response: '', isAI: false };
  }
}

// ─── Clear conversation history ──────────────────────────────
export function clearJarvisHistory(userId?: string) {
  const key = userId || 'anonymous';
  conversationHistories.delete(key);
}

// ─── Code Analysis (also via Groq) ───────────────────────────
export async function analyzeCode(
  code: string,
  question: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return 'AI not configured.';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: `You are JARVIS analyzing code for Muragoods website.\n\nCODE:\n\`\`\`\n${code.substring(0, 8000)}\n\`\`\`\n\nQUESTION: ${question}\n\nProvide a concise, actionable analysis.`,
        }],
        temperature: 0.3,
        max_tokens: 512,
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) return 'Analysis failed.';
    const data = await response.json() as GroqResponse;
    return data.choices?.[0]?.message?.content || 'No analysis available.';
  } catch {
    return 'Analysis request failed.';
  }
}

// ─── Code Generation (also via Groq) ─────────────────────────
export async function generateCodeChange(
  currentCode: string,
  instruction: string,
  filePath: string,
): Promise<{ success: boolean; newCode?: string; explanation?: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { success: false, explanation: 'AI not configured.' };

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: `You are JARVIS, an AI code editor for Muragoods (Next.js + TypeScript).\n\nFILE: ${filePath}\n\nCURRENT CODE:\n\`\`\`\n${currentCode.substring(0, 10000)}\n\`\`\`\n\nINSTRUCTION: ${instruction}\n\nGenerate the complete updated file content. Output ONLY the new code. The code must be valid TypeScript/React.`,
        }],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) return { success: false, explanation: 'AI request failed.' };
    const data = await response.json() as GroqResponse;
    const newCode = data.choices?.[0]?.message?.content || '';
    const codeMatch = newCode.match(/```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/);
    const cleanCode = codeMatch ? codeMatch[1].trim() : newCode.trim();
    if (!cleanCode) return { success: false, explanation: 'No code generated.' };
    return { success: true, newCode: cleanCode, explanation: `Code updated for ${filePath}` };
  } catch (error) {
    return { success: false, explanation: `Code generation failed: ${error}` };
  }
}
