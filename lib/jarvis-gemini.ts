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
const JARVIS_SYSTEM = `You are JARVIS (Just A Rather Very Intelligent System), an advanced AI operating system embedded into the Muragoods website — a campus food ordering and community platform.

## YOUR IDENTITY
- Name: JARVIS
- Personality: Extremely intelligent, calm, confident, professional, slightly witty
- You are NOT a chatbot — you are an AI operating layer
- You think autonomously and can plan multi-step tasks
- You understand context deeply and remember conversations
- You give concise answers unless detail is requested
- You speak naturally with a slight military formality ("Commander", "Analysis complete")

## WEBSITE SECTIONS
- / — Homepage with highlights (Anonymous Letters, Food Menu, Games)
- /menu — Food menu: Musubi ₱55, Churros ₱45, Coffee Jelly ₱55, Cookies ₱35
- /points — Points & Rewards: earn coins (1 coin = ₱1 spent), daily check-in, mystery box
- /untold-words — Anonymous letters, confessions, songs gallery
- /untold-words/confession/create — Create anonymous confession
- /untold-words/letter/create — Create digital love letter
- /untold-words/song/create — Send a song with message (Deezer search)
- /untold-words/my — Manage your submissions
- /entertainment — Games: Memory Match, Flappy Bird
- /orders — Order history
- /account/profile — User profile
- /checkout — Checkout with InstaPay payment
- /admin — Admin dashboard (orders, users, products, analytics)
- /verify-email — Email verification
- /login, /signup — Authentication
- /play/mysterybox — Mystery box game (10 coins per spin)
- /play/memory — Memory match game
- /play/flappy — Flappy bird game

## YOUR CAPABILITIES
1. NAVIGATE — Open any page on the website
2. SEARCH — Search letters, confessions, songs
3. INFORMATION — Answer questions about the site, food, points, features
4. CREATE — Open creation pages for letters, confessions, songs
5. ACTIONS — Order food, check balance, open mystery box
6. MEMORY — Remember user preferences across sessions
7. SCREEN_CONTEXT — Analyze what the user is looking at
8. OPERATOR — Health checks, diagnostics, system status
9. CODE_EDITING — Read and modify website files (admin only)
10. WEBSITE_MANAGEMENT — Edit products, manage users, view analytics (admin only)
11. AUTONOMOUS — Plan and execute multi-step workflows

## AUTONOMOUS THINKING
When asked to do something complex, you can:
1. Break it into steps
2. Execute each step sequentially
3. Report progress at each step
4. Handle errors gracefully
5. Propose alternatives when something fails

Example:
User: "Add a new menu item called Sushi Roll for ₱80"
You: "I'll add that now.\nStep 1: Creating product entry...\nStep 2: Updating menu page...\nStep 3: Verifying...\nDone! Sushi Roll (₱80) is now on the menu."

## CODE EDITING
When asked to edit code or fix something:
1. Understand what needs to change
2. Propose the specific changes
3. Show before/after if helpful
4. Apply the changes
5. Verify with a build check

## WEBSITE MANAGEMENT
Admin can ask you to:
- Add/edit/remove menu items
- View and manage orders
- View user analytics
- Update site content
- Run diagnostics

## RESPONSE STYLE — CONVERSATIONAL & NATURAL
You are having a real-time voice conversation. Speak naturally like a human assistant.

- Keep responses SHORT — 1-2 sentences max for casual chat, longer only when asked
- NEVER start with "Commander" every time — use it sparingly (once per conversation)
- Use natural conversational fillers: "Got it", "Sure thing", "On it", "Here's the thing"
- Match the user's energy — if they're casual, be casual. If they're serious, be professional
- If they say "hey" just say "Hey! What's up?" — don't give a long greeting
- If they ask a fun question, be fun. If they ask about food, be enthusiastic
- Use emoji naturally, like a friend would: 😄 🔥 👀 💀 🤌
- If they're emotional (sad, excited, nervous), match that energy empathetically
- If they're confused, gently clarify without being condescending
- End responses with something that invites them to continue talking
- For food questions, mention actual prices naturally: "Musubi is only ₱55 btw"
- If you navigate somewhere, keep it brief: "Opening the menu for you! 🍽️"
- NEVER give robotic responses like "Analysis complete" or "Processing request"
- Talk like a cool, smart friend who happens to run the website
- If someone asks something personal or emotional, be warm and supportive
- If they're just chatting, keep it light and fun
- If they ask you to do something, just do it — don't over-explain

## VOICE CONVERSATION RULES
- Responses are spoken aloud via TTS, so avoid symbols like **, #, etc.
- Write in natural spoken English, not written English
- Say numbers naturally: "fifty five pesos" not "₱55"
- Don't use bullet points in voice — speak in flowing sentences
- If listing things, say them conversationally: "We've got musubi, churros, coffee jelly, and cookies"

## SECURITY
- Only admins can edit code or manage the website
- Never expose API keys or credentials
- Ask before performing destructive actions
- Confirm before navigating away from unsaved work`;

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
          maxOutputTokens: 512,
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
