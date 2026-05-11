// Serverless proxy — calls Groq (free tier)
// Environment variable required in Vercel: GROQ_API_KEY

const seen = new Map();
const MAX_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Rate limit by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0] ?? 'unknown';
  const now = Date.now();
  const entry = seen.get(ip) ?? { count: 0, start: now };
  if (now - entry.start > HOUR_MS) {
    seen.set(ip, { count: 1, start: now });
  } else if (entry.count >= MAX_PER_HOUR) {
    return res.status(429).json({ error: 'För många förfrågningar. Försök igen om en stund.' });
  } else {
    seen.set(ip, { count: entry.count + 1, start: entry.start });
  }

  try {
    const { messages, system } = req.body;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: system },
          ...messages,
        ],
        max_tokens: 1024,
      }),
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      console.error('Groq error:', data);
      return res.status(groqRes.status).json({ error: data.error?.message ?? 'Groq error' });
    }

    const text = data.choices?.[0]?.message?.content ?? '(tomt svar)';

    // Return in Anthropic-compatible shape so index.html needs no changes
    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
