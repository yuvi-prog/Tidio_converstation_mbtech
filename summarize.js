const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
function getClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

// Survey/feedback phrases — skip these when finding the last real response
const SURVEY_PATTERNS = [
  /how (would you |do you )?rate/i,
  /satisfaction/i,
  /\bfeedback\b/i,
  /\bsurvey\b/i,
  /rate (your|this|the|our)/i,
  /was (this|your) (chat|conversation|support|experience) helpful/i,
  /did (we|i) (resolve|answer|help)/i,
  /on a scale/i,
  /thumb(s)? (up|down)/i,
];

function isSurveyMessage(text) {
  return SURVEY_PATTERNS.some(p => p.test(text));
}

function buildTranscript(messages) {
  return messages.map(m => {
    const role =
      m.actor === 'visitor' ? 'Customer' :
      m.actor === 'agent'   ? 'Agent' : 'Bot';
    return `${role}: ${m.message_content}`;
  }).join('\n');
}

// Fallback when no Gemini key — extract key info directly from transcript
function extractiveSummary(messages) {
  const opening = messages.find(m => m.actor === 'visitor');

  let lastResponse = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.actor === 'visitor') continue;
    if (isSurveyMessage(m.message_content)) continue;
    if (m.message_content.trim().length < 20) continue;
    lastResponse = m;
    break;
  }

  const visitorMsgs = messages.filter(m => m.actor === 'visitor');
  const first = new Date(messages[0].time_sent);
  const last = new Date(messages[messages.length - 1].time_sent);
  const mins = Math.round((last - first) / 60000);
  const duration = mins < 1 ? '< 1 min' : `${mins} min${mins !== 1 ? 's' : ''}`;

  const lines = [];
  if (opening) lines.push(`<b>Asked:</b> "${opening.message_content.trim()}"`);
  if (lastResponse) {
    const text = lastResponse.message_content.trim();
    lines.push(`<b>Last response:</b> "${text.length > 280 ? text.slice(0, 277) + '…' : text}"`);
  }
  lines.push(`<b>Stats:</b> ${messages.length} messages (${visitorMsgs.length} from visitor) · ${duration}`);
  return lines.join('<br>');
}

async function summarizeConversation(messages, contactName) {
  const client = getClient();

  if (!client) {
    return extractiveSummary(messages);
  }

  const transcript = buildTranscript(messages);
  const name = contactName || 'the customer';

  try {
    const model = client.getGenerativeModel({ model: 'gemini-3.8-flash' });
    const result = await model.generateContent(
      `Summarise this technical support chat in 2-3 sentences. Focus on: what ${name} needed, what was resolved or answered, and any outstanding issues. Be concise and factual.\n\nTranscript:\n${transcript}`
    );
    return result.response.text().trim();
  } catch (err) {
    console.error('Gemini summarize failed, using extractive fallback:', err.message);
    return extractiveSummary(messages);
  }
}

module.exports = { summarizeConversation };
