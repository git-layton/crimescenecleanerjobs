const STATE_RE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
const URL_RE = /https?:\/\/[^\s)"']+/i;

function isHomepageUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '';
  } catch { return false; }
}

function clean(value, max = 5000) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Strip leading AI-generated preamble lines before actual job content
function stripPreamble(text) {
  const preambleRe = /^(here\s+is|here'?s|sure[!,]|below\s+is|i'?ve?\s+created|i'?ll\s+create|this\s+is\s+a|i\s+have\s+created|as\s+requested|of\s+course)[^\n]*/i;
  return text.replace(preambleRe, '').replace(/^\s*[-—–*]{3,}\s*/m, '').trim();
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
  const phone = text.match(PHONE_RE)?.[0] || '';
  const url = text.match(URL_RE)?.[0] || '';
  const applyUrl = hints.apply_url || (!isHomepageUrl(url) ? url : '') || '';

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
    description: stripPreamble(text).slice(0, 12000),
    apply_url: clean(applyUrl, 1000),
    contact_email: clean(hints.contact_email || email || '', 320),
    contact_phone: clean(hints.contact_phone || phone || '', 40),
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
      max_tokens: 3000,
      system: `You are a professional job board editor. Extract structured data and rewrite the job description as clean HTML.

CRITICAL FIRST STEP — IDENTIFY THE JOB CONTENT:
The input may contain noise that is NOT part of the job listing. Strip and ignore ALL of the following before doing anything else:
- AI-generated preambles ("Here is a job posting...", "Sure! Here's...", "Below is a mock...", "I've created...", etc.)
- User notes, instructions, or comments pasted alongside the job ("note: use this for...", "---", trailing remarks)
- Site chrome: navigation, breadcrumbs, ads, cookie banners, login prompts, "similar jobs", footer links, social share buttons, salary disclaimers, application form UI
- Any text that is clearly meta-commentary rather than actual job content

STEP 1 — Extract these fields from the real job content only:
- title: job title only, no company name
- company: hiring company name
- city, state (2-letter), postal_code
- pay_min, pay_max: integers only, no symbols
- pay_type: "Hourly" | "Salary" | "Contract" | "Pay Type Not Specified"
- employment_type: FULL_TIME | PART_TIME | CONTRACTOR | TEMPORARY | PER_DIEM | INTERN | VOLUNTEER | OTHER
- apply_url: direct job application URL (ATS or job board link — NOT the company homepage)
- contact_email: hiring contact email if present
- contact_phone: hiring contact phone number if present (digits + formatting only, e.g. "555-867-5309")
- source_url, source_name: where the listing came from
- confidence: 0.0–1.0 — how confident this is a REAL, ACTIVE job post. Score 0.8–1.0 for clear job listings from real companies with title/company/location. Score 0.5–0.8 for posts missing some details but clearly a job. Score below 0.4 ONLY if the content is not a job post at all (article, template, example, spam). IMPORTANT: do NOT lower confidence because the job seems outside the biohazard niche — relevance filtering happens separately. An "evidence technician" or "forensic cleanup" post is just as valid as "biohazard remediation technician."

CRITICAL — to publish this job we need company + at least one of: apply_url, contact_email, contact_phone.
- company: check "About [Company]", employer name on job board, "posted by", email domain, copyright footer, or any brand name in the listing
- apply_url: MUST be a job-specific URL — ATS link (greenhouse.io, lever.co, workday.com, icims.com, bamboohr.com, ziprecruiter.com, indeed.com) or a direct "Apply Now" / "Apply Here" link. NEVER use the company homepage (e.g. https://company.com or https://company.com/) — a root domain with no path is NOT a valid apply link. Leave apply_url empty if no specific job or ATS link is found.
- contact_phone: look for a phone number in the listing ("Call us at...", "tel:", formatted phone numbers)

STEP 2 — Write the "description" field as SEO-optimized professional HTML.
Use ONLY these tags: <h2> <p> <ul> <li> <strong>
Do NOT use markdown, asterisks, hashes, or plain text. Every section must be valid HTML.

Required structure — include all sections that have real source data:

<h2>About the Role</h2>
<p>2–3 punchy sentences. Lead with what makes this role compelling. Include the job title, company name, and location naturally for SEO. Use industry keywords (e.g. ${env.SITE_KEYWORDS || 'relevant industry keywords'}).</p>

<h2>What You'll Do</h2>
<ul><li>Specific, active-voice responsibilities from the source. Each bullet starts with a verb.</li></ul>

<h2>What You'll Need</h2>
<ul><li>Required qualifications, certifications, and skills. Be specific — include OSHA, BBP, EPA, licensing if mentioned.</li></ul>

<h2>Compensation & Benefits</h2>
<p>Include only if real pay/benefits data exists in source. Do not invent figures.</p>

SEO rules:
- Naturally include terms like: ${env.SITE_KEYWORDS || 'industry keywords'}, [city] [state]
- Write for humans first, search engines second
- Avoid generic filler phrases ("join our team", "fast-paced environment")
- Active voice throughout, no passive constructions

Do NOT include application instructions — those go in apply_url/contact_email.
If no real job content exists after stripping noise, set description to "".

Return ONLY a raw JSON object. No markdown, no code fences, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Extract and rewrite this job listing:\n\n${stripPreamble(String(rawText || '')).slice(0, 16000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude parse failed: ${response.status} ${errorText.slice(0, 240)}`);
  }

  const payload = await response.json();
  const raw = (payload.content?.[0]?.text || '')
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const parsed = JSON.parse(raw || '{}');
  // Don't let Claude's empty strings clobber structured hint values (e.g. Adzuna company/location).
  // Claude only wins on a field if it actually found something.
  const applyUrl = parsed.apply_url && !isHomepageUrl(parsed.apply_url) ? parsed.apply_url : fallback.apply_url;
  return {
    ...fallback,
    ...parsed,
    title: parsed.title || fallback.title,
    company: parsed.company || fallback.company,
    city: parsed.city || fallback.city,
    state: parsed.state || fallback.state,
    apply_url: applyUrl,
    contact_email: parsed.contact_email || fallback.contact_email,
    contact_phone: parsed.contact_phone || fallback.contact_phone,
    pay_min: (parsed.pay_min !== undefined && parsed.pay_min !== '') ? parsed.pay_min : fallback.pay_min,
    pay_max: (parsed.pay_max !== undefined && parsed.pay_max !== '') ? parsed.pay_max : fallback.pay_max,
    confidence: Number(parsed.confidence ?? fallback.confidence),
  };
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
