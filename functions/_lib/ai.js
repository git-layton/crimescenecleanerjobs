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

async function claudeParse(env, rawText, hints) {
  const fallback = heuristicParse(rawText, hints);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: [
        'Extract a real job listing into JSON from the provided raw text.',
        'The raw text may contain navigation menus, ads, footers, cookie notices, application forms, or other page junk — ignore all of that.',
        'Never invent missing facts. Use empty strings for unknown text fields.',
        'Only return a raw JSON object — no markdown, no code fences.',
        'Keys: title, company, city, state, postal_code, pay_min, pay_max, pay_type, employment_type, description, apply_url, contact_email, source_url, source_name, confidence.',
        'description: Write clean well-formatted HTML using only <p> <h2> <h3> <ul> <ol> <li> <strong> <em>. Organize logically: overview, responsibilities, requirements, benefits. Strip all navigation, ads, boilerplate, and non-job content. If the text contains no real job description, use empty string.',
        'pay_min and pay_max: numbers only, no dollar signs or commas.',
        'pay_type: "Hourly", "Salary", "Contract", or "Pay Type Not Specified".',
        'employment_type must be FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY, PER_DIEM, INTERN, VOLUNTEER, or OTHER.',
        'confidence: 0–1 float reflecting how likely this is a real active job posting.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ hints, rawText: String(rawText || '').slice(0, 16000) }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude parse failed: ${response.status} ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const text = payload.content?.[0]?.text || '';
  const parsed = JSON.parse(text || '{}');
  return { ...fallback, ...parsed, confidence: Number(parsed.confidence ?? fallback.confidence) };
}

export async function parseJobText(env, rawText, hints = {}) {
  if (!rawText && !hints.title) return heuristicParse('', hints);

  if (!env.ANTHROPIC_API_KEY) {
    return heuristicParse(rawText, hints);
  }

  try {
    return await claudeParse(env, rawText, hints);
  } catch (error) {
    console.error(error);
    return { ...heuristicParse(rawText, hints), ai_error: error.message };
  }
}
