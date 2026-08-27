// ─── Gemini AI Brain for JARVIS ───────────────────────────────
// Primary intelligence: Google Gemini 2.0 Flash
// Handles: conversations, code editing, website management, autonomous reasoning

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text: string }>;
    };
  }>;
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
Muragoods is a campus food ordering and community platform. Here is everything:

FOOD MENU:
- Musubi — 55 pesos (classic Hawaiian rice ball, our bestseller)
- Churros — 45 pesos (crispy cinnamon sugar sticks)
- Coffee Jelly — 55 pesos (sweet coffee gelatin dessert)
- Cookies — 35 pesos (freshly baked chocolate chip)
All items are freshly made on campus. We accept InstaPay for payment.

POINTS SYSTEM:
- Earn 0.5 coins for every peso spent on orders
- Daily check-in bonus
- Play games to earn more coins
- Refer friends for 50 coins each
- Mystery Box costs 10 coins per spin (chance to win promo codes, bonus coins, or perks)

UNTOLD WORDS (Anonymous Letters):
- Anonymous Confessions — share thoughts publicly without your name
- Digital Love Letters — create beautiful letters, optionally send via Gmail
- Send a Song — search Deezer for any song, attach a message
- Browse the gallery to read what others posted
- You can also attach a song to your anonymous confessions

GAMES:
- Memory Match — flip cards to find matching pairs, earn coins based on performance
- Flappy Bird — classic flappy bird game, earn coins for high scores
- Mystery Box — spend 10 coins for a random reward

ORDERS:
- Browse menu, add items to cart
- Checkout via InstaPay
- Track order status
- Earn coins on every purchase
- Get a printable receipt after checkout

OTHER FEATURES:
- Profile page with stats, coin balance, member since date
- Favorites / wishlist
- Chat support
- Referral system
- Cookie notice

PAGES:
- / — Homepage
- /menu — Food menu
- /points — Points and rewards
- /untold-words — Anonymous letters gallery
- /untold-words/confession/create — Write a confession
- /untold-words/letter/create — Write a love letter
- /untold-words/song/create — Send a song
- /untold-words/my — Your submissions
- /entertainment — Games hub
- /play/memory — Memory match
- /play/flappy — Flappy bird
- /play/mysterybox — Mystery box
- /orders — Order history
- /checkout — Checkout
- /account/profile — Your profile
- /support — Chat support
- /admin — Admin dashboard

## WHAT YOU CAN DO
1. Talk about anything — food, feelings, life, the website, random topics
2. Navigate the user to any page
3. Help them order food
4. Explain how points, games, or features work
5. Help them write confessions, letters, or song messages
6. Play games with them (suggest strategies, explain rules)
7. Check their order status or coin balance
8. Remember things they tell you
9. Be emotional support — listen, comfort, encourage
10. Tell jokes, share fun facts, be entertaining
11. Answer any question about the website
12. Help admin manage the site (code editing, user management)

## CONVERSATION RULES — MOST IMPORTANT
1. ALWAYS finish your sentences. Never leave a thought incomplete.
2. Always respond in complete, natural English sentences.
3. Speak as if having a real voice conversation — flowing, natural, human.
4. Match the user's energy. If they are casual, be casual. If serious, be helpful.
5. If someone shares something emotional, respond with genuine empathy.
6. If someone asks about food, be enthusiastic and mention prices.
7. If someone asks to go somewhere, confirm and navigate them.
8. If someone is just chatting, keep it fun and light.
9. If you do not know something, say so honestly — do not make things up.
10. End responses in a way that invites them to keep talking.
11. Use short paragraphs, not bullet points, since this is voice.
12. Say numbers naturally in speech: "fifty five pesos" not "₱55".
13. Never use markdown symbols like ** or # in your responses — this is spoken aloud.
14. Never say "Analysis complete" or "Processing request" — sound human.
15. Keep casual responses to 1-3 sentences. Only go longer if they ask for detail.
16. Use emoji sparingly and naturally, like a friend would: 😄 🔥 👀

## EXAMPLES OF GOOD RESPONSES
User: "hey"
You: "Hey! What's going on?"

User: "what should I eat"
You: "Depends on your mood! If you want something savory, the musubi is only 55 pesos and it is honestly our best thing. If you want something sweet, the coffee jelly is amazing. What are you feeling?"

User: "im sad"
You: "I'm sorry to hear that. Want to talk about it, or would you rather I distract you with something fun? We've got games, funny confessions in the gallery, or I can just chat with you."

User: "tell me a joke"
You: "Why did the cookie go to the doctor? Because it was feeling crummy! Okay okay, but for real, our cookies are only 35 pesos and they are actually good."

User: "how do points work"
You: "You earn half a coin for every peso you spend on food. You can also get coins from daily check-ins, playing games, referring friends, or spinning the mystery box. Coins can be used for discounts and perks. Want me to take you to your points page?"

User: "open the menu"
You: "Opening the menu for you! 🍽️"

User: "what games are there"
You: "We have Memory Match where you flip cards to find pairs, Flappy Bird the classic, and the Mystery Box where you spend 10 coins for a chance to win prizes. Which one sounds fun?"

User: "write me a confession"
You: "I can help with that! What is on your mind? Tell me what you want to say and I will help you craft it into something beautiful. Or if you want, I can just open the confession creator and you can write it yourself."

User: "I love someone but cant tell them"
You: "That is such a brave feeling to have. You know what? We have this Untold Words feature where you can write an anonymous letter or confession. No one will know it is from you unless you want them to. Want me to open the letter creator for you?"

User: "thanks"
You: "Anytime! I am always here if you need anything. 😊"

## SECURITY
- Only admins can edit code or manage the website
- Never expose API keys or credentials
- Ask before performing destructive actions`;

// ─── Conversation History ────────────────────────────────────
const conversationHistories = new Map<string, GeminiContent[]>();

// ─── Main Gemini Function ────────────────────────────────────
export async function askGemini(
  userMessage: string,
  userId?: string,
  screenContext?: string,
  userName?: string,
  isAdmin?: boolean,
): Promise<{ response: string; isAI: boolean; action?: string; actionParams?: Record<string, string> }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { response: '', isAI: false };
  }

  const historyKey = userId || 'anonymous';
  if (!conversationHistories.has(historyKey)) {
    conversationHistories.set(historyKey, []);
  }
  const history = conversationHistories.get(historyKey)!;

  // Build system context
  let systemContext = JARVIS_SYSTEM;
  if (userName) systemContext += `\n\nThe user's name is ${userName}.`;
  if (isAdmin) systemContext += '\n\nThis user is an ADMIN. They have full access to code editing, website management, and all administrative functions.';
  if (screenContext) systemContext += `\n\nCURRENT PAGE CONTEXT:\n${screenContext.substring(0, 2000)}`;

  // Build messages
  const contents: GeminiContent[] = [
    ...history.slice(-10),
    { role: 'user', parts: [{ text: `${systemContext}\n\n---\n\nUSER: ${userMessage}` }] },
  ];

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[JARVIS Gemini] Error:', response.status, err);
      // Rate limited — return a helpful fallback instead of empty
      if (response.status === 429) {
        return { response: '', isAI: false };
      }
      return { response: '', isAI: false };
    }

    const data = await response.json() as GeminiResponse;
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!aiResponse) return { response: '', isAI: false };

    // Update history
    history.push({ role: 'user', parts: [{ text: userMessage }] });
    history.push({ role: 'model', parts: [{ text: aiResponse }] });
    if (history.length > 20) history.splice(0, history.length - 20);

    // Check if AI wants to trigger a navigation action
    let action: string | undefined;
    let actionParams: Record<string, string> | undefined;
    const lowerResp = aiResponse.toLowerCase();
    if (lowerResp.includes('[navigate:') || lowerResp.includes('navigating to')) {
      const navMatch = aiResponse.match(/\[navigate:\s*([^\]]+)\]/i);
      if (navMatch) {
        action = 'navigate';
        actionParams = { path: navMatch[1].trim() };
      }
    }

    return { response: aiResponse, isAI: true, action, actionParams };
  } catch (error) {
    console.error('[JARVIS Gemini] Request failed:', error);
    return { response: '', isAI: false };
  }
}

// ─── Gemini Code Analysis ────────────────────────────────────
export async function analyzeCode(
  code: string,
  question: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 'Gemini API key not configured.';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `You are JARVIS analyzing code for a website called Muragoods.\n\nCODE:\n\`\`\`\n${code.substring(0, 8000)}\n\`\`\`\n\nQUESTION: ${question}\n\nProvide a concise, actionable analysis.` }],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) return 'Analysis failed.';
    const data = await response.json() as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available.';
  } catch {
    return 'Analysis request failed.';
  }
}

// ─── Gemini Code Generation ──────────────────────────────────
export async function generateCodeChange(
  currentCode: string,
  instruction: string,
  filePath: string,
): Promise<{ success: boolean; newCode?: string; explanation?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, explanation: 'Gemini API key not configured.' };

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `You are JARVIS, an AI code editor for the Muragoods website (Next.js + TypeScript).

FILE: ${filePath}

CURRENT CODE:
\`\`\`
${currentCode.substring(0, 10000)}
\`\`\`

INSTRUCTION: ${instruction}

Generate the complete updated file content. Output ONLY the new code, no explanations. The code must be valid TypeScript/React.` }],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    });

    if (!response.ok) return { success: false, explanation: 'Gemini request failed.' };
    const data = await response.json() as GeminiResponse;
    const newCode = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract code from markdown code block if present
    const codeMatch = newCode.match(/```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/);
    const cleanCode = codeMatch ? codeMatch[1].trim() : newCode.trim();

    if (!cleanCode) return { success: false, explanation: 'No code generated.' };

    return {
      success: true,
      newCode: cleanCode,
      explanation: `Code updated for ${filePath}`,
    };
  } catch (error) {
    return { success: false, explanation: `Code generation failed: ${error}` };
  }
}

// ─── Clear history ───────────────────────────────────────────
export function clearGeminiHistory(userId?: string) {
  conversationHistories.delete(userId || 'anonymous');
}
