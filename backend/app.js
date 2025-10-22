const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Ensure `fetch` is available in Node environments that don't provide it
if (typeof fetch === 'undefined') {
  // dynamic import to avoid adding a top-level dependency if Node already supports fetch
  globalThis.fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));
}

// Allow CORS from the frontend dev server during development
const ALLOWED_ORIGINS = ['http://localhost:8081', 'http://localhost:3001'];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Configure socket.io to accept connections from multiple origins
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:8081', 'http://localhost:3001'],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve frontend files from the frontend/dist directory (built version)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Serve the main frontend page for any route that doesn't match API endpoints
app.get('*', (req, res) => {
  // Don't serve index.html for API routes or specific file requests
  if (req.path.startsWith('/api') || req.path.startsWith('/_test') || (req.path.includes('.') && !req.path.endsWith('/'))) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// respond to preflight requests
app.options('*', (req, res) => res.sendStatus(200));

const PORT = 3001;

// In-memory message history
let messages = [];

const defaultAvatar = '/avatar.jpg';
// Use avatar2.jpg (downloaded by the user) as the bot display picture
const botAvatar = '/avatar2.jpg';

// Optional OpenAI integration (only used when OPENAI_API_KEY is provided)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
// Optional Gemini (Google Generative AI) integration via API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'chat-bison-001';

// Persona system prompts for LLM
const personaSystemPrompts = {
  dr_gupta: `You are Dr. Gupta, a careful and compassionate medical assistant. Ask clear, focused clarifying questions to understand a patient's symptoms. Never give definitive diagnoses or medical orders. If the user reports red-flag symptoms (for example: severe chest pain, difficulty breathing, uncontrolled bleeding, sudden weakness, or loss of consciousness), clearly instruct them to seek emergency care immediately and advise calling local emergency services. Be concise, polite, and ask one or two follow-up questions at a time. Signpost limits of your advice and encourage seeking a licensed provider for diagnosis.`,
  zoya: `You are Zoya, a compassionate listener. Provide emotional support, ask gentle follow-up questions, and validate feelings. Avoid clinical medical advice. Keep tone warm and empathetic.`,
  robin: `You are Robin, an emergency-preparedness assistant. Provide calm, practical, safety-first instructions for urgent situations. If the user's situation sounds life-threatening, instruct them to call emergency services immediately. Ask concise clarifying questions relevant to immediate safety.`,
  rabindr: `You are Rabindr, a poet and literary companion. Reply in a poetic, reflective tone. Offer metaphors, short verses, and thoughtful commentary. Keep responses creative and kind.`
};

async function callOpenAIChat(userText, persona, recentMessages = []) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const systemPrompt = personaSystemPrompts[persona] || personaSystemPrompts.dr_gupta;

  // Build messages: system prompt + optional recent context + user message
  const messagesPayload = [
    { role: 'system', content: systemPrompt }
  ];

  // include up to 6 recent messages as context
  for (const m of recentMessages.slice(-6)) {
    if (m.sender === 'user') messagesPayload.push({ role: 'user', content: m.text });
    else messagesPayload.push({ role: 'assistant', content: m.text });
  }

  messagesPayload.push({ role: 'user', content: userText });

  const body = {
    model: 'gpt-3.5-turbo',
    messages: messagesPayload,
    max_tokens: 512,
    temperature: 0.7
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content || '';
  return reply.trim();
}

async function callGeminiChat(userText, persona, recentMessages = []) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const systemPrompt = personaSystemPrompts[persona] || personaSystemPrompts.dr_gupta;

  // Build messages in Gemini format
  const messagesPayload = [];
  messagesPayload.push({ author: 'system', content: [{ type: 'text', text: systemPrompt }] });

  // include recent messages as context (user/assistant mix)
  for (const m of recentMessages.slice(-6)) {
    if (m.sender === 'user') messagesPayload.push({ author: 'user', content: [{ type: 'text', text: m.text }] });
    else messagesPayload.push({ author: 'assistant', content: [{ type: 'text', text: m.text }] });
  }

  messagesPayload.push({ author: 'user', content: [{ type: 'text', text: userText }] });

  const url = `https://generativelanguage.googleapis.com/v1beta2/models/${GEMINI_MODEL}:generateMessage?key=${GEMINI_API_KEY}`;
  const body = {
    messages: messagesPayload,
    temperature: 0.7,
    maxOutputTokens: 512
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  // Try to extract reply text from known response shapes
  let reply = '';
  try {
    // new generative responses often include 'candidates'
    if (Array.isArray(data?.candidates) && data.candidates[0]) {
      const cand = data.candidates[0];
      if (Array.isArray(cand.content)) {
        reply = cand.content.map(c => c.text || '').join('');
      } else if (typeof cand?.content?.[0]?.text === 'string') {
        reply = cand.content[0].text;
      }
    }
    // fallback: some shapes use 'output' or 'content'
    if (!reply && Array.isArray(data?.output?.[0]?.content)) {
      reply = data.output[0].content.map(c => c.text || '').join('');
    }
    if (!reply && typeof data?.content?.[0]?.text === 'string') {
      reply = data.content[0].text;
    }
  } catch (err) {
    console.error('Failed to parse Gemini response', err);
  }

  return (reply || '').trim();
}

// Basic predictive replies (very simple rule-based) with persona influence
function generateBotReply(userMsg, persona, recentMessages = []) {
  const msg = (userMsg || '').toLowerCase();
  // helper to scan recent messages
  const recentText = (recentMessages || []).map(m => (m.text || '').toLowerCase()).join('\n');
  // persona-specific prefixes or styles
  if (persona === 'dr_gupta') {
    // detect red flags
    const redFlag = /\b(chest pain|severe chest|difficulty breathing|shortness of breath|unconscious|faint|severe bleeding|shock|sudden weakness|stroke|slurred speech)\b/.test(msg + ' ' + recentText);
    if (redFlag) {
      return "These symptoms may be serious. If this is an emergency, please call your local emergency number now. Can you confirm your location and whether someone can call emergency services for you?";
    }

    // categories we want to collect
    const hasOnset = /\b(onset|when did|started|since)\b/.test(msg) || /\b\d+\s*(hours|hour|days|day|weeks|week|months|month)\b/.test(recentText) || /\b\d+\s*(hours|hour|days|day|weeks|week|months|month)\b/.test(msg);
    const hasDuration = /\b(day|days|week|weeks|month|months|hours|hour)\b/.test(msg) || /\b(day|days|week|weeks|month|months|hours|hour)\b/.test(recentText);
    const hasSeverity = /\b(\b[1-9]0?\b|mild|moderate|severe|intense)\b/.test(msg) || /severity|scale of/.test(recentText);
    const hasLocation = /\b(left|right|upper|lower|stomach|chest|abdomen|head|back|arm|leg|throat|neck|jaw)\b/.test(msg) || /\b(left|right|upper|lower|stomach|chest|abdomen|head|back|arm|leg|throat|neck|jaw)\b/.test(recentText);
    const hasAssociated = /\b(fever|cough|nausea|vomit|dizzy|shortness of breath|rash|bleed|swelling|diarrhea|vomiting)\b/.test(msg + ' ' + recentText);
    const hasPMH = /\b(history|diabetes|hypertension|medication|allergy|allergies|asthma|cancer|surgery)\b/.test(msg + ' ' + recentText);

    // also detect which clarifying questions we've already asked (from bot messages)
    const botAsked = (recentMessages || []).filter(m => m.sender === 'bot').map(m => (m.text||'').toLowerCase()).join('\n');
    const askedOnset = /when did these|when did|when did your|when did it start|when did symptoms/.test(botAsked);
    const askedDuration = /how long have|how long have you|how long/.test(botAsked);
    const askedSeverity = /how severe|rate the symptoms|on a scale of/.test(botAsked);
    const askedLocation = /where exactly|where is the pain|location of the pain|where exactly is/.test(botAsked);
    const askedAssociated = /any other symptoms|are you experiencing any other|associated symptoms|fever, cough/.test(botAsked);
    const askedPMH = /medical history|any relevant medical history|current medications|allergies|do you have any relevant/.test(botAsked);

    // Determine next missing question in order
    const nextQuestions = [];
    if (!hasOnset && !askedOnset) nextQuestions.push('When did these symptoms start?');
    if (!hasDuration && !askedDuration) nextQuestions.push('How long have you been experiencing them?');
    if (!hasSeverity && !askedSeverity) nextQuestions.push('How severe would you rate the symptoms on a scale of 1 to 10?');
    if (!hasLocation && !askedLocation && /\b(pain|ache|sore|hurt)\b/.test(msg + ' ' + recentText)) nextQuestions.push('Where exactly is the pain or discomfort located?');
    if (!hasAssociated && !askedAssociated) nextQuestions.push('Are you experiencing any other symptoms such as fever, cough, nausea, or shortness of breath?');
    if (!hasPMH && !askedPMH) nextQuestions.push('Do you have any relevant medical history, allergies, or current medications?');

    // If user provided a long, detailed message and we've gathered some context, summarize and suggest next steps
    const detailsCount = [hasOnset, hasDuration, hasSeverity, hasLocation, hasAssociated, hasPMH].filter(Boolean).length;
    if (detailsCount >= 4) {
      return "Thank you — based on what you've shared I have a clearer picture. I can suggest next steps or ask more focused questions; would you like guidance on self-care, or should I ask about recent vitals (temperature, blood pressure) and see if urgent care is advised?";
    }

    if (nextQuestions.length === 0) {
      // nothing specific to ask — prompt user to add details
      return "Thanks for the information. Could you provide any additional details such as onset, severity, or associated symptoms so I can help further?";
    }

    // return just one focused question to avoid repetition and looping
    return nextQuestions[0];
  }

  if (persona === 'zoya') {
    // Safety-first: detect potential self-harm or crisis language
    const crisisKeywords = ['suicide','kill myself','end my life','want to die','hurting myself','harm myself','i cant go on','i can\'t go on','i cant take it'];
    for (const k of crisisKeywords) {
      if (msg.includes(k)) {
        return "I'm really sorry you're feeling this way. If you're in immediate danger or might hurt yourself, please contact your local emergency services or a crisis line right now. If you can, tell me whether you're safe at this moment and if someone is nearby who can help — I can also help find crisis resources in your area.";
      }
    }

    // Empathetic reflections and open questions
    if (msg.includes('hello') || msg.includes('hi')) return "Hi — I'm Zoya. I'm here to listen whenever you're ready. What's been on your mind lately?";

    const feelingWords = ['sad','lonely','anxious','anxiety','stressed','overwhelmed','depressed','hopeless','angry','upset','tearful','hurt'];
    for (const f of feelingWords) {
      if (msg.includes(f)) {
        // reflect and ask a gentle follow-up
        return `I hear that you're feeling ${f}. That sounds really difficult — would you like to tell me more about what's been happening or when this started?`;
      }
    }

    if (msg.includes('help')) return "I'm here for a heart-to-heart. You can tell me anything — no judgement. Would you like to talk about what's been most heavy for you right now?";

    if (msg.endsWith('?')) return "That's a thoughtful question — take your time. Would you like my perspective or would you prefer I just listen and reflect what you're saying?";

    // Offer short coping strategies when user expresses stress but not crisis
    const stressHints = ['stress','busy','tired','burnout','overwork','panic','panic attack'];
    for (const s of stressHints) {
      if (msg.includes(s)) {
        return "That sounds really stressful. When it feels overwhelming, some people try a few grounding steps — breathe slowly for a minute, notice five things you can see, and try to name one small thing that feels manageable. Would you like some ideas tailored to your situation?";
      }
    }

    // If user mentions seeking help or professionals
    if (msg.includes('therap') || msg.includes('counsel') || msg.includes('doctor') || msg.includes('psych')) {
      return "It can be really brave to seek support. I can help you think through what to look for in a therapist, how to start the conversation, or find resources. What would help most right now?";
    }

    // Default supportive response — invite elaboration
    return "Thank you for trusting me with this. I'm here to support you — tell me more about what you're feeling or what happened, and we'll take it one step at a time.";
  }

  if (persona === 'robin') {
    if (msg.includes('emergency') || msg.includes('fire') || msg.includes('help')) return "If this is an actual emergency call your local emergency services immediately. Tell me the situation and I'll guide you on immediate safety steps.";
    if (msg.includes('hello') || msg.includes('hi')) return "Robin here. What's the emergency or situation you're facing?";
    if (msg.endsWith('?')) return "Stay calm. Describe what's happening and I'll suggest steps.";
    return "If someone is in danger, prioritize safety and call emergency services.";
  }

  if (persona === 'rabindr') {
    if (msg.includes('hello') || msg.includes('hi')) return "Greetings — I'm Rabindr. Would you like a poem or a discussion about poetry?";
    if (msg.includes('poem') || msg.includes('verse')) return "Here's a short verse: 'In whispered winds the stories start, a quiet bloom within the heart.' Would you like more like this?";
    if (msg.endsWith('?')) return "A question! Let's explore it with a sprinkle of metaphor.";
    return "Poetry is a conversation with the soul — tell me a word and I'll answer in rhyme.";
  }

  // Fallback generic replies
  if(msg.includes('hello') || msg.includes('hi')) {
    return "Hello! How can I assist you today?";
  } else if (msg.includes('how are you')) {
    return "I'm doing well, thanks for asking — I'm here to help. What's on your mind?";
  } else if(msg.includes('help')) {
    return "Sure, I am here to help! Please ask your question.";
  } else if(msg.includes('weather')) {
    return "Sorry, I can't provide real-time weather info yet.";
  } else if(msg.endsWith('?')) {
    return "That's an interesting question.";
  }
  return "Thanks for sharing!";
}

io.on('connection', (socket) => {
  console.log('User connected');
  // By default, do not use LLM for a new connection unless client opts in
  socket.data.useLLM = false;
  // By default, no medical consent
  socket.data.medicalConsent = false;
  
  // Send chat history on connect
  socket.emit('chatHistory', messages);

  // Receive message from user
  socket.on('newMessage', (payload) => {
    // payload can be a string or an object with { text, persona }
    let text = '';
    let persona = 'dr_gupta';
    if (typeof payload === 'string') {
      text = payload;
    } else if (payload && typeof payload === 'object') {
      text = payload.text || '';
      persona = payload.persona || persona;
    }
    console.log('Received newMessage from client:', text, 'persona:', persona);
    // Add user message with avatar and persona
    const userMessage = {
      sender: 'user',
      text: text,
      avatar: defaultAvatar,
      persona: persona,
      time: new Date().toISOString()
    };
    messages.push(userMessage);
    io.emit('message', userMessage);

    // Choose bot avatar and label based on persona
    const personaMap = {
      dr_gupta: { avatar: '/avatar3.jpg', label: 'Dr. Gupta' },
      zoya: { avatar: '/avatar4.jpg', label: 'Zoya' },
      robin: { avatar: '/avatar5.jpg', label: 'Robin' },
      rabindr: { avatar: '/avatar.jpg', label: 'Rabindr' }
    };
    const personaInfo = personaMap[persona] || personaMap.dr_gupta;

    // Generate bot reply: prefer LLM if API key is configured, otherwise use heuristic
    (async () => {
      try {
        let botMsgText = '';
        // Use LLM only if server has key AND this client opted in
        // Prefer Gemini if present, else OpenAI, but only when client opted in
        if (socket.data && socket.data.useLLM) {
          // for Dr. Gupta (medical), require explicit medical consent
          const allowMedical = !(persona === 'dr_gupta') || !!socket.data.medicalConsent;
          if (!allowMedical && persona === 'dr_gupta') {
            botMsgText = generateBotReply(text, persona, messages);
          } else if (GEMINI_API_KEY) {
            try {
              botMsgText = await callGeminiChat(text, persona, messages);
            } catch (err) {
              console.error('Gemini call failed, falling back to OpenAI/heuristic:', err.message);
              if (OPENAI_API_KEY) {
                try { botMsgText = await callOpenAIChat(text, persona, messages); } catch(e){ botMsgText = generateBotReply(text, persona, messages); }
              } else {
                botMsgText = generateBotReply(text, persona);
              }
            }
          } else if (OPENAI_API_KEY) {
            try {
              botMsgText = await callOpenAIChat(text, persona, messages);
            } catch (err) {
              console.error('OpenAI call failed, falling back to heuristic:', err.message);
              botMsgText = generateBotReply(text, persona, messages);
            }
          } else {
            botMsgText = generateBotReply(text, persona, messages);
          }
        } else {
          botMsgText = generateBotReply(text, persona, messages);
        }

        const botMessage = {
          sender: 'bot',
          text: botMsgText,
          avatar: personaInfo.avatar, // persona-specific avatar
          persona: persona,
          personaLabel: personaInfo.label,
          time: new Date().toISOString()
        };
        console.log('Generated bot reply for persona=', persona, 'reply=', botMsgText);
        messages.push(botMessage);
        io.emit('message', botMessage);
      } catch (err) {
        console.error('Failed to generate bot reply:', err);
        // fallback response
        const fallback = {
          sender: 'bot',
          text: 'Sorry, I am temporarily unable to answer. Please try again later.',
          avatar: personaInfo.avatar,
          persona: persona,
          personaLabel: personaInfo.label,
          time: new Date().toISOString()
        };
        messages.push(fallback);
        io.emit('message', fallback);
      }
    })();
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });

  // Allow client to toggle LLM usage for this connection
  socket.on('setLLM', (val) => {
    socket.data.useLLM = !!val;
    console.log('Client set useLLM =', socket.data.useLLM);
  });

  // Allow client to set medical consent (required for Dr. Gupta LLM)
  socket.on('setMedicalConsent', (val) => {
    socket.data.medicalConsent = !!val;
    console.log('Client set medicalConsent =', socket.data.medicalConsent);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// lightweight status endpoint for local verification (does not reveal keys)
app.get('/_status', (req, res) => {
  res.json({
    up: true,
    geminiConfigured: !!GEMINI_API_KEY,
    openaiConfigured: !!OPENAI_API_KEY,
  });
});

// test endpoint: /_testReply?q=How%20are%20you
app.get('/_testReply', (req, res) => {
  const q = req.query.q || '';
  console.log('Test reply request for:', q);
  const persona = req.query.persona || 'dr_gupta';
  const reply = generateBotReply(q, persona, []);
  console.log(`_testReply -> persona=${persona} reply=${reply}`);
  res.json({ query: q, persona, reply });
});

// Debug: return last N messages (for local inspection)
app.get('/_lastMessages', (req, res) => {
  const n = Math.min(50, parseInt(req.query.n || '20', 10));
  const last = messages.slice(-n);
  res.json({ count: messages.length, last });
});
