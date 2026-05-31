const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
let GROQ_API_KEY = '';

async function initGroq() {
  try {
    const res = await fetch('/.env');
    const text = await res.text();
    const match = text.match(/^GROQ_API_KEY=(.+)$/m);
    if (match) GROQ_API_KEY = match[1].trim();
  } catch {}
}

async function groqChat(messages, options = {}) {
  if (!GROQ_API_KEY) await initGroq();
  if (!GROQ_API_KEY) throw new Error('Groq API key not found. Create .env file with GROQ_API_KEY');
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model || 'llama-3.3-70b-versatile',
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens || 600
    })
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function analyzeAccident(severity, description) {
  const prompt = `You are RoadSoS AI, an emergency road safety assistant. Analyze this accident report and provide:
1. First aid guidance (what to do immediately)
2. What to tell the emergency dispatcher
3. Recommended service type (trauma/ambulance/police/rescue)
4. Criticality assessment

Accident Severity: ${severity}
Description: ${description}

Respond in concise bullet points. Use Indian emergency context.`;
  return groqChat([{ role: 'user', content: prompt }], { temperature: 0.2 });
}

async function smartSOSBroadcast(lat, lng, address) {
  const prompt = `You are RoadSoS AI, an emergency response assistant. Generate a concise emergency broadcast message for someone who just triggered an SOS. Include:
1. Immediate actions to take (stay calm, safety tips)
2. Key information to have ready for responders
3. Medical advice for common road accident scenarios (assume general case)
4. What to do while waiting for help

Location: ${lat}, ${lng}${address ? ` (${address})` : ''}
Current time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Respond in concise, clear bullet points. Be reassuring but direct.`;
  return groqChat([{ role: 'user', content: prompt }], { temperature: 0.2, maxTokens: 500 });
}

async function smartSearch(query) {
  const services = allServices.map(s => `${s.name} (${s.subtype}, ${s.type})`).join('\n');
  const prompt = `Given these available emergency services in Chennai:
${services}

User search query: "${query}"

Recommend the most relevant services (up to 3). Consider:
- If medical emergency → recommend trauma centers/ambulances
- If crime/accident → recommend police
- If vehicle issue → recommend rescue services
- If general emergency → recommend nearest all

Return ONLY the service IDs (like tc1, amb2, ps3) separated by commas. No explanation.`;
  const result = await groqChat([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 100 });
  return result.match(/[a-z]+\d+/gi) || [];
}

async function chatWithAI(message) {
  const prompt = `You are RoadSoS AI, an emergency road safety assistant for India. Answer this user query concisely and helpfully:

${message}

Keep response brief (2-4 sentences). Give practical, actionable advice for Indian road conditions. Include emergency numbers if relevant.`;
  return groqChat([{ role: 'user', content: prompt }], { temperature: 0.4, maxTokens: 300 });
}
