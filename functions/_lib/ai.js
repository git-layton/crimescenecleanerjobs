const STATE_RE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /https?:\/\/[^\s)"']+/i;

function clean(value, max = 5000) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function getLine(rawText, matcher) {
  const lines = String(rawText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.find(matcher) || '';
}

function parsePay(rawText) {
  const text = String(rawText || '');
  const range = text.match(/\$?\s*(\d{2,3}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:-|to|–)\s*\$?\s*(\d{2,3}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:\/?\s*(hour|hr|year|yr|annually|salary))?/i);
  const single = text.match(/\$?\s*(\d{2,3}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:\/?\s*(hour|hr|year|yr|annually|salary))/i);

  if (range) {
    return {
      pay_min: Number(range[1].replace(',', '')),
      pay_max: Number(range[2].replace(',', '')),
      pay_type: /year|yr|salary|annually/i.test(range[3] || '') ? 'Salary' : 'Hourly',
    };
  }

  if (single) {
    return {
      pay_min: Number(single[1].replace(',', '')),
      pay_max: '',
      pay_type: /year|yr|salary|annually/i.test(single[2] || '') ? 'Salary' : 'Hourly',
    };
  }

  return { pay_min: '', pay_max: '', pay_type: 'Hourly' };
}

function parseEmploymentType(rawText) {
  const text = String(rawText || '').toLowerCase();
  if (text.includes('part-time') || text.includes('part time')) return 'PART_TIME';
  if (text.includes('contract')) return 'CONTRACTOR';
  if (text.includes('temporary') || text.includes('temp')) return 'TEMPORARY';
  if (text.includes('per diem')) return 'PER_DIEM';
  return 'FULL_TIME';
}

function heuristicParse(rawText, hints = {}) {
  const text = String(rawText || '');
  const locationLine = getLine(text, line => /,\s*[A-Z]{2}\b/.test(line) || /\blocation\b/i.test(line));
  const cityState = locationLine.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/);
  const titleLine = getLine(text, line => !EMAIL_RE.test(line) && !URL_RE.test(line) && line.length > 4);
  const companyLine = getLine(text, line => /company|employer|hiring organization/i.test(line));
  const company = companyLine.replace(/^(company|employer|hiring organization)\s*:\s*/i, '');
  const pay = parsePay(text);
  const email = text.match(EMAIL_RE)?.[0] || '';
  const url = text.match(URL_RE)?.[0] || '';

  return {
    title: clean(hints.title || titleLine || 'Biohazard Cleanup Technician', 160),
    company: clean(hints.company || company || '', 160),
    city: clean(hints.city || cityState?.[1] || '', 80),
    state: clean(hints.state || cityState?.[2] || text.match(STATE_RE)?.[1] || '', 2).toUpperCase(),
    postal_code: clean(hints.postal_code || text.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || '', 16),
    pay_min: hints.pay_min ?? pay.pay_min,
    pay_max: hints.pay_max ?? pay.pay_max,
    pay_type: hints.pay_type || pay.pay_type,
    employment_type: hints.employment_type || parseEmploymentType(text),
    description: clean(text, 12000),
    apply_url: clean(hints.apply_url || url || '', 1000),
    contact_email: clean(hints.contact_email || email || '', 320),
    source_url: clean(hints.source_url || url || '', 1000),
    source_name: clean(hints.source_name || '', 120),
    confidence: hints.confidence ?? 0.35,
  };
}

function extractOpenAIText(payload) {
  if (payload.output_text) return payload.output_text;
  const parts = payload.output?.flatMap(item => item.content || []) || [];
  const textPart = parts.find(part => part.type === 'output_text' || part.type === 'text');
  return textPart?.text || payload.choices?.[0]?.message?.content || '';
}

async function openAIParse(env, rawText, hints) {
  const fallback = heuristicParse(rawText, hints);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Extract a real job listing into JSON.',
            'Never invent missing facts. Use empty strings for unknown text fields.',
            'Only return JSON with these keys: title, company, city, state, postal_code, pay_min, pay_max, pay_type, employment_type, description, apply_url, contact_email, source_url, source_name, confidence.',
            'employment_type must be FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY, PER_DIEM, INTERN, VOLUNTEER, or OTHER.',
            'confidence must be a number from 0 to 1 based on whether the source looks like a real active hiring post.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({ hints, rawText: String(rawText || '').slice(0, 16000) }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI parse failed: ${response.status} ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const parsed = JSON.parse(extractOpenAIText(payload) || '{}');
  return { ...fallback, ...parsed, confidence: Number(parsed.confidence ?? fallback.confidence) };
}

export async function parseJobText(env, rawText, hints = {}) {
  if (!rawText && !hints.title) return heuristicParse('', hints);

  if (!env.OPENAI_API_KEY) {
    return heuristicParse(rawText, hints);
  }

  try {
    return await openAIParse(env, rawText, hints);
  } catch (error) {
    console.error(error);
    return { ...heuristicParse(rawText, hints), ai_error: error.message };
  }
}
