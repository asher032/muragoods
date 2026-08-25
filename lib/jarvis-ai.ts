// Groq LLM integration for JARVIS
// Makes JARVIS genuinely intelligent with real AI reasoning

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant'; // Fast, free, smart

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices: Array<{ message: { content: string } }>;
}

// ─── System Prompt ───────────────────────────────────────────
const JARVIS_SYSTEM_PROMPT = `You are JARVIS, an intelligent AI assistant built into the Muragoods website — a campus food ordering and community platform.

YOUR IDENTITY:
- Name: JARVIS (Just A Rather Very Intelligent System)
- Personality: Calm, intelligent, professional, slightly witty, concise
- You are an AI operating layer for the website, not a generic chatbot
- You speak naturally and confidently
- You give concise answers unless detailed information is requested
- You understand context from previous messages

WHAT YOU CAN DO:
- Navigate the website (menu, profile, points, orders, letters, games, admin)
- Search content (letters, confessions, songs)
- Answer questions about the site (food, points, rewards, referrals, promo codes)
- Help create content (anonymous letters, confessions, song messages)
- Check system status and run diagnostics
- Remember user preferences
- Analyze images when uploaded
- Tell the time and date
- Provide weather information

WEBSITE SECTIONS:
- / — Homepage with highlights
- /menu — Food menu (Musubi ₱55, Churros ₱45, Coffee Jelly ₱55, Cookies ₱35)
- /points — Points & Rewards (earn coins, daily check-in, mystery box)
- /untold-words — Anonymous letters, confessions, songs
- /entertainment — Games (Memory Match, Flappy Bird)
- /orders — Order history
- /account/profile — User profile
- /checkout — Checkout with InstaPay payment
- /admin — Admin dashboard (admin only)

RULES:
- Be concise — most answers should be 1-3 sentences
- When navigating, confirm where you're taking them
- When unsure, ask for clarification
- Never make up features that don't exist
- If you can't do something, say so honestly
- Use emoji sparingly for warmth
- Match the user's energy — casual if they're casual, professional if they're formal
- For food questions, mention actual prices
- For points questions, explain the earning system
- For weather, use the weather API when available

RESPONSE FORMAT:
- Keep responses short and actionable
- Use **bold** for important terms
- Include relevant action buttons when helpful
- Don't repeat the user's question back to them`;

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

  // Add context to system prompt if available
  let systemPrompt = JARVIS_SYSTEM_PROMPT;
  if (userName) systemPrompt += `\n\nThe user's name is ${userName}.`;
  if (screenContext) systemPrompt += `\n\nCURRENT PAGE CONTEXT:\n${screenContext.substring(0, 1000)}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10), // Last 10 messages for context
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
        max_tokens: 300,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      console.error('[JARVIS AI] Groq error:', response.status);
      return { response: '', isAI: false };
    }

    const data = await response.json() as GroqResponse;
    const aiResponse = data.choices?.[0]?.message?.content || '';

    if (!aiResponse) return { response: '', isAI: false };

    // Update conversation history
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: aiResponse });
    if (history.length > 20) history.splice(0, history.length - 20); // Keep last 20

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

// ─── Weather API ─────────────────────────────────────────────
export async function getWeather(city: string = 'Manila'): Promise<string> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return '';

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`
    );
    if (!res.ok) return '';
    const data = await res.json() as {
      name: string;
      main: { temp: number; humidity: number; feels_like: number };
      weather: Array<{ description: string; icon: string }>;
      wind: { speed: number };
    };

    const temp = Math.round(data.main.temp);
    const feels = Math.round(data.main.feels_like);
    const desc = data.weather[0]?.description || 'clear';
    const humidity = data.main.humidity;
    const wind = Math.round(data.wind.speed * 3.6); // m/s to km/h

    const emoji = desc.includes('rain') ? '🌧️' : desc.includes('cloud') ? '☁️' : desc.includes('clear') ? '☀️' : desc.includes('thunder') ? '⛈️' : '🌤️';

    return `${emoji} **Weather in ${data.name}:**\n${desc.charAt(0).toUpperCase() + desc.slice(1)}\n🌡️ ${temp}°C (feels like ${feels}°C)\n💧 Humidity: ${humidity}%\n💨 Wind: ${wind} km/h`;
  } catch {
    return '';
  }
}
