import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Clock, Briefcase, ChevronDown, ChevronUp,
  Search, PlusCircle, Building, Activity, TriangleAlert, Filter,
  Database, Radar, ShieldCheck, Download, Trash2, LogOut, Terminal, X,
  Cpu, Target, Banknote, Navigation, ShieldAlert, Wand2
} from 'lucide-react';

const ADMIN_TOKEN_KEY = 'csj_admin_token';

// --- CLOUDFLARE API CLIENT ---
const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || '';

const apiRequest = async (path, { method = 'GET', body, admin = false } = {}) => {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (admin) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}`);
  return payload;
};

const dbService = {
  listJobs: async ({ admin = false } = {}) => {
    const status = admin ? 'all' : 'active';
    const data = await apiRequest(`/api/jobs?status=${status}`, { admin });
    return data.jobs || [];
  },

  addJob: async (jobData, { publish = false } = {}) => {
    return apiRequest('/api/jobs', {
      method: 'POST',
      body: { ...jobData, status: publish ? 'active' : 'pending' },
      admin: publish,
    });
  },

  deleteJob: async (id) => apiRequest(`/api/jobs/${id}`, { method: 'DELETE', admin: true }),

  updateJobStatus: async (id, status) => apiRequest(`/api/jobs/${id}`, {
    method: 'PATCH',
    admin: true,
    body: { status },
  }),

  parseJob: async (text) => apiRequest('/api/parse-job', { method: 'POST', body: { text } }),

  scanJobs: async (query, location) => apiRequest('/api/admin/scan', {
    method: 'POST',
    admin: true,
    body: { query, location },
  }),

  listCandidates: async () => {
    const data = await apiRequest('/api/admin/candidates?status=pending', { admin: true });
    return data.candidates || [];
  },

  getCandidatesByRun: async (runId) => {
    const data = await apiRequest(`/api/admin/candidates?run_id=${runId}`, { admin: true });
    return data.candidates || [];
  },

  approveCandidate: async (id) => apiRequest(`/api/admin/candidates/${id}/approve`, { method: 'POST', admin: true }),

  rejectCandidate: async (id) => apiRequest(`/api/admin/candidates/${id}/reject`, { method: 'POST', admin: true }),

  parseAndPublish: async (id) => apiRequest(`/api/admin/candidates/${id}/parse-and-publish`, { method: 'POST', admin: true }),

  requestEditCode: async (job, email) => apiRequest('/api/edit-codes/request', {
    method: 'POST',
    body: { job, email },
  }),

  verifyEditCode: async (job, code) => apiRequest('/api/edit-codes/verify', {
    method: 'POST',
    body: { job, code },
  }),

  updateWithEditCode: async (job, code, jobData) => apiRequest('/api/edit-codes/update', {
    method: 'PATCH',
    body: { job, code, jobData },
  }),

  logEvent: (event, metadata) => fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, metadata }),
  }).catch(() => {}),

  getEvents: () => apiRequest('/api/events', { admin: true }),

  getScanHistory: () => apiRequest('/api/admin/scan-history', { admin: true }),

  getAnalytics: () => apiRequest('/api/admin/analytics', { admin: true }),

  updateJobFull: async (id, jobData) => apiRequest(`/api/jobs/${id}`, {
    method: 'PATCH',
    admin: true,
    body: jobData,
  }),

  getSettings: () => apiRequest('/api/admin/settings', { admin: true }),
  updateSettings: (patch) => apiRequest('/api/admin/settings', { method: 'PATCH', admin: true, body: patch }),

  verifyAdminToken: async (token) => {
    const response = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 429) throw new Error('Too many attempts. Try again in 15 minutes.');
    return response.ok;
  },
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
  'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN',
  'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA',
  'WI', 'WV', 'WY',
];

// --- UTILITY FUNCTIONS ---
const timeAgo = (dateString) => {
  if (!dateString) return 'Just now';
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  const interval = seconds / 86400;
  if (interval >= 1) return `${Math.floor(interval)}d ago`;
  const h = seconds / 3600;
  if (h >= 1) return `${Math.floor(h)}h ago`;
  const m = seconds / 60;
  if (m >= 1) return `${Math.floor(m)}m ago`;
  return 'Just now';
};

const isNew = (dateString) => {
  if (!dateString) return true;
  return (new Date() - new Date(dateString)) / 3600000 < 24;
};

const formatPay = (min, max, type) => {
  if (!min && !max) return 'Pay Negotiable';
  let str;
  if (min && max) str = `$${Number(min).toLocaleString()} – $${Number(max).toLocaleString()}`;
  else if (min) str = `From $${Number(min).toLocaleString()}`;
  else str = `Up to $${Number(max).toLocaleString()}`;
  return `${str} ${type !== 'Pay Type Not Specified' ? type : ''}`.trim();
};

const inlineMd = (text) => text
  .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/__(.+?)__/g, '<strong>$1</strong>')
  .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
  .replace(/_([^_\n]+?)_/g, '<em>$1</em>');

const stripMdPreamble = (text) =>
  text.replace(/^(here\s+is|here'?s|sure[!,]|below\s+is|i'?ve?\s+created|i'?ll\s+create|this\s+is\s+a|as\s+requested|of\s+course)[^\n]*/i, '')
      .replace(/^\s*[-—–*]{3,}\s*/m, '').trim();

const markdownToHtml = (text) => {
  if (!text) return '';
  if (/<[a-zA-Z][^>]*>/.test(text)) return text; // already HTML
  const cleaned = stripMdPreamble(text);
  // Normalize inline headings (no newline before them) into their own lines
  const normalized = cleaned
    .replace(/(?<!\n)(#{1,3}\s)/g, '\n$1')
    .replace(/(?<!\n)(\*\*[A-Z][^*]+:\*\*)/g, '\n$1');
  const lines = normalized.split(/\r?\n/);
  const out = [];
  let inUl = false;
  let inOl = false;
  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if (/^###\s+/.test(line)) {
      closeList();
      out.push(`<h3>${inlineMd(line.replace(/^###\s+/, ''))}</h3>`);
    } else if (/^#{1,2}\s+/.test(line)) {
      closeList();
      out.push(`<h2>${inlineMd(line.replace(/^#+\s+/, ''))}</h2>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inUl) { closeList(); out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inOl) { closeList(); out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`);
    } else {
      closeList();
      out.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
};

const sanitizeHtml = (raw) => String(raw || '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  .replace(/<object[\s\S]*?<\/object>/gi, '')
  .replace(/<embed[\s\S]*?>/gi, '')
  .replace(/\s+on\w+="[^"]*"/gi, '')
  .replace(/\s+on\w+='[^']*'/gi, '')
  .replace(/href="javascript:[^"]*"/gi, 'href="#"')
  .replace(/src="javascript:[^"]*"/gi, 'src=""');

const formStateFromJob = (job = {}) => ({
  title: job.title || '',
  company: job.company || '',
  company_url: job.company_url || '',
  location: job.location || job.postal_code || '',
  city: job.city || '',
  state: job.state || 'Select',
  payrangemin: job.payrangemin ?? job.pay_min ?? '',
  payrangemax: job.payrangemax ?? job.pay_max ?? '',
  paytype: job.paytype || job.pay_type || 'Pay Type Not Specified',
  category: job.category || 'Full-time',
  content: job.content || job.description || '',
  contact: job.contact || job.apply_url || job.contact_email || '',
  owner_email: job.owner_email || '',
});

// --- MODAL ---
const TacticalModal = ({ isOpen, title, message, type, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
        <div className={`h-1 w-full ${type === 'danger' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
        <div className="p-6">
          <h3 id="modal-title" className="text-lg font-bold text-zinc-100 uppercase tracking-tight mb-2 flex items-center">
            {type === 'danger'
              ? <TriangleAlert className="w-5 h-5 mr-2 text-red-500" aria-hidden="true" />
              : <Activity className="w-5 h-5 mr-2 text-amber-500" aria-hidden="true" />}
            {title}
          </h3>
          <p className="text-sm text-zinc-400 mb-6">{message}</p>
          <div className="flex justify-end space-x-3">
            {type === 'danger' && (
              <button onClick={onCancel} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-100 uppercase tracking-wider transition-colors">
                Cancel
              </button>
            )}
            <button
              onClick={onConfirm}
              className={`px-5 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors text-zinc-950 ${type === 'danger' ? 'bg-red-500 hover:bg-red-400' : 'bg-amber-500 hover:bg-amber-400'}`}
            >
              {type === 'danger' ? 'Confirm Action' : 'Acknowledge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- JOB CARD ---
const stripHtml = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const isPhone = (v) => v && /^\+?[\d\s\-()+]{7,}$/.test(v.trim());

const applyInfo = (job) => {
  // Website apply link — default, most common
  if (job.apply_url) {
    return { type: 'url', href: job.apply_url, label: 'Apply Online', display: null };
  }
  // Explicit contact email
  const email = job.contact_email || (job.contact && job.contact.includes('@') ? job.contact : null);
  if (email) {
    return { type: 'email', href: `mailto:${email}`, label: 'Apply by Email', display: email };
  }
  // Phone number — show it, don't auto-dial
  const phone = job.contact && isPhone(job.contact) ? job.contact : null;
  if (phone) {
    return { type: 'phone', href: `tel:${phone.replace(/\s/g, '')}`, label: 'Call to Apply', display: phone };
  }
  // URL in contact field
  if (job.contact && (job.contact.startsWith('http') || job.contact.startsWith('/'))) {
    return { type: 'url', href: job.contact, label: 'Apply Online', display: null };
  }
  // Fallback — link to detail page
  return { type: 'url', href: job.detail_path || `/jobs/${job.slug}`, label: 'View Posting', display: null };
};

const JobCard = ({ job, onDeleteRequest }) => {
  const [expanded, setExpanded] = useState(false);
  const rawContent = job.content || '';
  const isHtml = rawContent.trimStart().startsWith('<');
  const isLong = rawContent.length > 400;
  const jobHref = job.detail_path || `/jobs/${job.slug}`;
  const companyIsLink = Boolean(job.company_url);

  return (
    <article className="group relative bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-5 transition-all duration-300 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true"></div>

      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-bold tracking-tight">
              <a href={jobHref} className="text-zinc-100 hover:text-amber-400 transition-colors underline-offset-2 hover:underline">
                {job.title}
              </a>
            </h2>
            {job.status && job.status !== 'active' && (
              <span className="bg-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm">
                {job.status}
              </span>
            )}
            {isNew(job.created) && (
              <span className="bg-amber-500 text-zinc-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm flex items-center">
                <Activity className="w-3 h-3 mr-1" aria-hidden="true" /> New
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center text-zinc-400 gap-y-2 gap-x-4">
            <span className="flex items-center text-sm font-medium text-zinc-300">
              <Building className="w-4 h-4 mr-1.5 text-zinc-500" aria-hidden="true" />
              {companyIsLink
                ? <a href={job.company_url} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">{job.company}</a>
                : job.company}
            </span>
            <span className="flex items-center text-sm">
              <Navigation className="w-4 h-4 mr-1.5 text-zinc-500" aria-hidden="true" />
              <a href={`https://www.google.com/maps/search/${encodeURIComponent([job.city, job.state].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">{job.city}, {job.state}</a>
            </span>
            <span className="flex items-center text-sm">
              <Clock className="w-4 h-4 mr-1.5 text-zinc-500" aria-hidden="true" /> {timeAgo(job.created)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <span className="inline-flex items-center px-3 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-300">
          <Briefcase className="w-3.5 h-3.5 mr-1.5 text-amber-500" aria-hidden="true" /> {job.category}
        </span>
        <span className="inline-flex items-center px-3 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs font-semibold text-green-400">
          <Banknote className="w-3.5 h-3.5 mr-1.5 text-green-500" aria-hidden="true" /> {formatPay(job.payrangemin, job.payrangemax, job.paytype)}
        </span>
      </div>

      {isHtml ? (
        <div className="mb-4 relative">
          <div
            className={`job-description text-sm overflow-hidden transition-all ${expanded ? '' : 'max-h-28'}`}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawContent) }}
          />
          {!expanded && isLong && <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />}
        </div>
      ) : (
        <div className="text-zinc-400 whitespace-pre-wrap mb-4 text-sm leading-relaxed">
          {expanded ? rawContent : rawContent.substring(0, 300) + (isLong ? '...' : '')}
        </div>
      )}

      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-500 hover:text-amber-400 text-xs font-bold uppercase tracking-widest flex items-center mb-5 transition-colors"
          aria-expanded={expanded}
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3 mr-1" aria-hidden="true" /> Show less</>
            : <><ChevronDown className="w-3 h-3 mr-1" aria-hidden="true" /> Read full posting</>}
        </button>
      )}

      <div className="flex justify-between items-center mt-5 pt-5 border-t border-zinc-800/50">
        <div className="flex items-center gap-3 flex-wrap">
          {(() => {
            const apply = applyInfo(job);
            if (apply.type === 'url') {
              return (
                <a href={apply.href} target="_blank" rel="noopener noreferrer"
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold uppercase tracking-wide text-sm py-2.5 px-6 rounded-md transition-all active:scale-95">
                  {apply.label}
                </a>
              );
            }
            if (apply.type === 'email') {
              return (
                <a href={apply.href}
                  className="flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm font-mono transition-colors">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Email</span>
                  {apply.display}
                </a>
              );
            }
            if (apply.type === 'phone') {
              return (
                <span className="flex items-center gap-2 text-sm font-mono text-zinc-300">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Call</span>
                  {apply.display}
                </span>
              );
            }
          })()}
          <a href={jobHref}
            className="text-zinc-400 hover:text-amber-400 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1">
            View Posting →
          </a>
        </div>
        {onDeleteRequest && (
          <button
            onClick={() => onDeleteRequest(job.id)}
            className="text-zinc-600 hover:text-red-500 text-sm font-medium transition-colors uppercase tracking-widest text-[10px]"
          >
            Remove Post
          </button>
        )}
      </div>
    </article>
  );
};

// --- JOB FORM ---
const ContactInput = ({ value, onChange }) => {
  const detect = (v) => v && v.includes('@') ? 'email' : v && /^\+?[\d\s\-()+]{7,}$/.test(v.trim()) ? 'phone' : 'url';
  const [type, setType] = useState(() => detect(value));
  const types = [
    { id: 'url', label: 'Website', placeholder: 'https://jobs.yourcompany.com/apply', inputType: 'url' },
    { id: 'phone', label: 'Phone', placeholder: '+1 (555) 000-0000', inputType: 'tel' },
    { id: 'email', label: 'Email', placeholder: 'hiring@company.com', inputType: 'email' },
  ];
  const inputClass = 'w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors';
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {types.map(t => (
          <button key={t.id} type="button" onClick={() => setType(t.id)}
            className={`px-3 py-1 text-xs font-bold uppercase tracking-wide rounded transition-colors ${type === t.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <input type={types.find(t => t.id === type).inputType} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={types.find(t => t.id === type).placeholder}
        className={inputClass} />
    </div>
  );
};

const RichTextEditor = ({ value, onChange, parseKey }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.innerHTML = value || ''; }, [parseKey]);
  const exec = (cmd, val = null) => { ref.current.focus(); document.execCommand(cmd, false, val); onChange(ref.current.innerHTML); };
  const ToolBtn = ({ cmd, val, children, title }) => (
    <button type="button" title={title} onMouseDown={e => { e.preventDefault(); exec(cmd, val); }}
      className="px-2 py-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded text-sm transition-colors min-w-[28px]">
      {children}
    </button>
  );
  return (
    <div className="border border-zinc-800 rounded-md overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 transition-colors">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-zinc-900 border-b border-zinc-800">
        <ToolBtn cmd="bold" title="Bold"><strong>B</strong></ToolBtn>
        <ToolBtn cmd="italic" title="Italic"><em>I</em></ToolBtn>
        <ToolBtn cmd="underline" title="Underline"><span className="underline">U</span></ToolBtn>
        <span className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolBtn cmd="formatBlock" val="h2" title="Heading 2">H2</ToolBtn>
        <ToolBtn cmd="formatBlock" val="h3" title="Heading 3">H3</ToolBtn>
        <span className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolBtn cmd="insertUnorderedList" title="Bullet list">• List</ToolBtn>
        <ToolBtn cmd="insertOrderedList" title="Numbered list">1. List</ToolBtn>
        <span className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolBtn cmd="removeFormat" title="Clear formatting">Clear</ToolBtn>
      </div>
      <div ref={ref} contentEditable onInput={e => onChange(e.currentTarget.innerHTML)}
        className="rich-editor" suppressContentEditableWarning />
    </div>
  );
};

const JobForm = ({ onSave, onDirectSave, onCancel, onShowMessage, initialJob = null, mode = 'create' }) => {
  const [formData, setFormData] = useState(() => formStateFromJob(initialJob || {}));
  const [aiText, setAiText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [showPromo, setShowPromo] = useState(false);
  const [promoValid, setPromoValid] = useState(false);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [parseKey, setParseKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(mode === 'edit' ? 2 : 1);

  const setField = (key, val) => {
    setFormData(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const handleAIParsing = async () => {
    setIsProcessing(true);
    try {
      const result = await dbService.parseJob(aiText);
      const parsed = result.job;
      const inferredEmail = parsed.contact && parsed.contact.includes('@') ? parsed.contact : '';
      setFormData(prev => ({
        ...prev,
        ...parsed,
        owner_email: prev.owner_email || inferredEmail,
        content: markdownToHtml(parsed.content || aiText),
      }));
      setParseKey(k => k + 1);
      setStep(2);
    } catch (error) {
      onShowMessage('Parser Offline', `${error.message}. You can still finish the listing manually.`, 'info');
      setFormData(prev => ({ ...prev, content: markdownToHtml(aiText) }));
      setStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    const readable = file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name);
    if (!readable) {
      onShowMessage('Unsupported File', 'Drop a .txt or text file. For PDFs or images, copy and paste the text instead.', 'info');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAiText(ev.target.result);
    reader.readAsText(file);
  };

  const lookupZip = async (zip) => {
    if (!/^\d{5}$/.test(zip)) return;
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!res.ok) return;
      const data = await res.json();
      const place = data.places?.[0];
      if (place) setFormData(prev => ({ ...prev, location: zip, city: prev.city || place['place name'], state: prev.state === 'Select' || !prev.state ? place['state abbreviation'] : prev.state }));
    } catch {}
  };

  const validate = () => {
    const e = {};
    if (!formData.title.trim()) e.title = 'Job title is required';
    if (!formData.company.trim()) e.company = 'Company name is required';
    if (!formData.company_url.trim()) e.company_url = 'Company website is required';
    if (!formData.city.trim()) e.city = 'City is required';
    if (!formData.contact.trim()) e.contact = 'Contact method is required';
    if (mode !== 'edit' && !formData.owner_email.trim()) e.owner_email = 'Email required to send your edit link';
    return e;
  };

  const checkPromo = async (code) => {
    const res = await fetch('/api/checkout/verify-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    return data.valid === true;
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoChecking(true);
    setPromoError('');
    setPromoValid(false);
    try {
      const valid = await checkPromo(promoCode);
      if (valid) {
        setPromoValid(true);
      } else {
        setPromoError('Invalid promo code.');
      }
    } catch (err) {
      setPromoError(`Error: ${err.message}`);
    } finally {
      setPromoChecking(false);
    }
  };

  const handlePaymentAndSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsProcessing(true);
    try {
      if (promoCode.trim()) {
        let valid = promoValid;
        if (!valid) {
          setPromoError('');
          try {
            valid = await checkPromo(promoCode);
          } catch (err) {
            setPromoError(`Error: ${err.message}`);
            return;
          }
        }
        if (valid) {
          setPromoValid(true);
          await onDirectSave({ ...formData, promo_code: promoCode, created: new Date().toISOString() });
          return;
        }
        setPromoError('Invalid promo code.');
        return;
      }
      await onSave({ ...formData, created: new Date().toISOString() });
    } finally {
      setIsProcessing(false);
    }
  };

  const inputClass = 'w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors';
  const labelClass = 'block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2';

  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl mt-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,#f59e0b,#f59e0b_10px,#18181b_10px,#18181b_20px)] opacity-50" aria-hidden="true"></div>
        <div className="flex items-center gap-3 mb-4 mt-2">
          <Wand2 className="w-8 h-8 text-amber-500" aria-hidden="true" />
          <h2 className="text-2xl font-bold text-zinc-100 uppercase tracking-tight">Easy Post</h2>
        </div>
        <p className="text-zinc-400 mb-6 leading-relaxed text-sm font-mono">
          Paste your job description or drag and drop a text file. We'll extract the details and generate an SEO-optimized listing.
        </p>
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          className={`relative mb-4 rounded-lg transition-colors ${isDragging ? 'bg-amber-500/10 border-amber-500' : ''}`}
        >
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="Paste job description or drag & drop a .txt file here..."
            aria-label="Paste job description for AI parsing"
            className={`w-full h-52 p-4 bg-zinc-950 border-2 border-dashed ${isDragging ? 'border-amber-500' : 'border-zinc-700'} rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500 focus:bg-zinc-900 transition-colors resize-none font-mono text-sm`}
          />
          <label className="absolute bottom-3 right-3 cursor-pointer text-xs text-zinc-500 hover:text-amber-400 transition-colors">
            <input type="file" accept=".txt,.md,.csv,text/*" className="hidden" onChange={handleFileDrop} />
            Browse file
          </label>
        </div>
        <div className="flex flex-col items-center space-y-4">
          <button
            onClick={handleAIParsing}
            disabled={isProcessing || !aiText.trim()}
            className="w-full flex justify-center items-center bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold uppercase tracking-wide py-3.5 px-4 rounded-md transition-all active:scale-[0.98]"
          >
            {isProcessing ? 'Processing Data...' : 'Execute Parsing'}
          </button>
          <button onClick={() => setStep(2)} className="text-zinc-500 hover:text-zinc-300 text-sm font-medium underline underline-offset-4">
            Manual Override (Enter details yourself)
          </button>
        </div>
      </div>
    );
  }


  const errClass = 'text-red-400 text-xs mt-1';

  return (
    <div className="max-w-3xl mx-auto bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl mt-8">
      <h2 className="text-2xl font-bold mb-8 text-zinc-100 uppercase tracking-tight border-b border-zinc-800 pb-4">Job Details</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className={labelClass}>Job Title *</label>
          <input type="text" value={formData.title} onChange={e => setField('title', e.target.value)} className={`${inputClass}${errors.title ? ' border-red-500' : ''}`} />
          {errors.title && <p className={errClass}>{errors.title}</p>}
        </div>
        <div>
          <label className={labelClass}>Company Name *</label>
          <input type="text" value={formData.company} onChange={e => setField('company', e.target.value)} className={`${inputClass}${errors.company ? ' border-red-500' : ''}`} />
          {errors.company && <p className={errClass}>{errors.company}</p>}
        </div>
      </div>

      {mode !== 'edit' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className={labelClass}>Where to send edit link? *</label>
            <input type="email" value={formData.owner_email} onChange={e => setField('owner_email', e.target.value)} placeholder="your@email.com" className={`${inputClass}${errors.owner_email ? ' border-red-500' : ''}`} />
            {errors.owner_email && <p className={errClass}>{errors.owner_email}</p>}
          </div>
          <div>
            <label className={labelClass}>Company Website *</label>
            <input type="url" value={formData.company_url} onChange={e => setField('company_url', e.target.value)} placeholder="https://yourcompany.com" className={`${inputClass}${errors.company_url ? ' border-red-500' : ''}`} />
            {errors.company_url && <p className={errClass}>{errors.company_url}</p>}
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <label className={labelClass}>Company Website *</label>
          <input type="url" value={formData.company_url} onChange={e => setField('company_url', e.target.value)} placeholder="https://yourcompany.com" className={`${inputClass}${errors.company_url ? ' border-red-500' : ''}`} />
          {errors.company_url && <p className={errClass}>{errors.company_url}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <label className={labelClass}>ZIP Code</label>
          <input type="text" value={formData.location} onChange={e => { setField('location', e.target.value); lookupZip(e.target.value); }} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>City *</label>
          <input type="text" value={formData.city} onChange={e => setField('city', e.target.value)} className={`${inputClass}${errors.city ? ' border-red-500' : ''}`} />
          {errors.city && <p className={errClass}>{errors.city}</p>}
        </div>
        <div>
          <label className={labelClass}>State</label>
          <select value={formData.state} onChange={e => setField('state', e.target.value)} className={inputClass}>
            <option>Select</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div>
          <label className={labelClass}>Min Pay</label>
          <input type="number" value={formData.payrangemin} onChange={e => setField('payrangemin', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Max Pay</label>
          <input type="number" value={formData.payrangemax} onChange={e => setField('payrangemax', e.target.value)} className={inputClass} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Pay Type</label>
          <select value={formData.paytype} onChange={e => setField('paytype', e.target.value)} className={inputClass}>
            <option>Pay Type Not Specified</option><option>Hourly</option><option>Salary</option><option>Contract</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className={labelClass}>Job Type</label>
          <select value={formData.category} onChange={e => setField('category', e.target.value)} className={inputClass}>
            <option>Full-time</option><option>Part-time</option><option>Contract</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>How to Apply *</label>
          <ContactInput value={formData.contact} onChange={v => { setField('contact', v); }} />
          {errors.contact && <p className={errClass}>{errors.contact}</p>}
        </div>
      </div>

      <div className="mb-8">
        <label className={labelClass}>Job Description</label>
        <RichTextEditor value={formData.content} onChange={v => setFormData(prev => ({ ...prev, content: v }))} parseKey={parseKey} />
      </div>

      <div className="pt-6 border-t border-zinc-800">
        {mode !== 'edit' && (
          <div className="mb-4">
            {!showPromo ? (
              <button onClick={() => setShowPromo(true)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Have a promo code?</button>
            ) : (
              <div className="flex flex-col gap-1.5">
                {promoValid ? (
                  <span className="text-green-400 text-sm font-mono font-bold">✓ Promo code applied — no payment required</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={e => { setPromoCode(e.target.value); setPromoValid(false); setPromoError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                      placeholder="Enter promo code"
                      className={`w-48 p-2 bg-zinc-950 border rounded text-zinc-300 text-sm focus:outline-none focus:border-amber-500 transition-colors ${promoError ? 'border-red-500' : 'border-zinc-700'}`}
                    />
                    <button
                      onClick={handleApplyPromo}
                      disabled={promoChecking || !promoCode.trim()}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-sm rounded transition-colors"
                    >
                      {promoChecking ? 'Checking...' : 'Apply'}
                    </button>
                  </div>
                )}
                {promoError && <span className="text-red-400 text-xs font-mono">{promoError}</span>}
              </div>
            )}
          </div>
        )}
        {Object.keys(errors).length > 0 && (
          <p className="text-red-400 text-sm mb-4 font-mono">⚠ Please fill in the required fields highlighted above.</p>
        )}
        <div className="flex justify-end space-x-4">
          <button onClick={onCancel} className="px-6 py-2.5 rounded-md font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-100 transition-colors">Cancel</button>
          <button onClick={() => { dbService.logEvent('submit_click'); handlePaymentAndSave(); }} disabled={isProcessing} className="px-8 py-2.5 bg-amber-500 text-zinc-950 font-bold uppercase tracking-wide rounded-md hover:bg-amber-400 transition-colors active:scale-[0.98] disabled:opacity-50">
            {isProcessing ? 'Saving...' : mode === 'edit' ? 'Save Updates' : 'Post Job →'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- EDIT POST ---
const extractJobKey = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    const jobsIndex = parts.indexOf('jobs');
    return jobsIndex >= 0 ? parts[jobsIndex + 1] || raw : raw;
  } catch {
    return raw.replace(/^\/?jobs\//, '');
  }
};

// Formats raw alphanumeric into XXXX-XXX-XXX as the user types
const formatEditCode = (raw) => {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (chars.length <= 4) return chars;
  if (chars.length <= 7) return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  return `${chars.slice(0, 4)}-${chars.slice(4, 7)}-${chars.slice(7)}`;
};

const EditCodeInput = ({ value, onChange }) => {
  const [revealed, setRevealed] = useState(false);
  const handleChange = (e) => {
    const formatted = formatEditCode(e.target.value);
    onChange(formatted);
  };
  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={handleChange}
        placeholder="XXXX-XXX-XXX"
        autoComplete="off"
        spellCheck={false}
        className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-md text-amber-400 font-mono text-xl tracking-[0.25em] text-center focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors placeholder:text-zinc-700 placeholder:tracking-widest"
      />
      <button
        type="button"
        onClick={() => setRevealed(r => !r)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase tracking-widest transition-colors"
      >
        {revealed ? 'hide' : 'show'}
      </button>
    </div>
  );
};

const EditPostGateway = ({ initialJobKey = '', initialCode = '', onCancel, onShowMessage, onSaved }) => {
  const [code, setCode] = useState(() => formatEditCode(initialCode));
  const [verifiedJob, setVerifiedJob] = useState(null);
  const [verifiedCode, setVerifiedCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [showEmailFlow, setShowEmailFlow] = useState(false);
  const [emailJobKey, setEmailJobKey] = useState(initialJobKey);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const inputClass = 'w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors';
  const labelClass = 'block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2';

  const rawCode = code.replace(/[^A-Z0-9]/g, '');

  const handleVerify = async () => {
    if (rawCode.length < 10) { setCodeError('Code must be 10 characters.'); return; }
    setIsProcessing(true);
    setCodeError('');
    try {
      const result = await dbService.verifyEditCode('', code);
      setVerifiedJob(result.job);
      setVerifiedCode(code);
    } catch {
      setCodeError('Invalid or expired code. Check it and try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestCode = async () => {
    setIsProcessing(true);
    try {
      const result = await dbService.requestEditCode(extractJobKey(emailJobKey), email);
      if (result.edit_code) {
        setCode(formatEditCode(result.edit_code));
        setShowEmailFlow(false);
      } else {
        setEmailSent(true);
      }
    } catch (error) {
      onShowMessage('Request Failed', error.message, 'info');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async (jobData) => {
    setIsProcessing(true);
    try {
      await dbService.updateWithEditCode('', verifiedCode, jobData);
      onShowMessage('Updates Queued', 'Your changes were saved and queued for admin review.', 'info');
      await onSaved?.();
    } catch (error) {
      onShowMessage('Update Failed', error.message, 'info');
    } finally {
      setIsProcessing(false);
    }
  };

  if (verifiedJob) {
    return (
      <JobForm
        key={verifiedJob.id}
        mode="edit"
        initialJob={verifiedJob}
        onSave={handleSave}
        onCancel={onCancel}
        onShowMessage={onShowMessage}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-7 h-7 text-amber-500" aria-hidden="true" />
          <h2 className="text-xl font-black text-zinc-100 uppercase tracking-tight">Edit Your Listing</h2>
        </div>
        <p className="text-zinc-500 text-sm font-mono mb-8">Enter the edit code from your email or the confirmation screen.</p>

        <div className="mb-6">
          <label className={labelClass}>Edit Code</label>
          <EditCodeInput value={code} onChange={setCode} />
          {codeError && <p className="text-red-400 text-xs mt-2 font-mono">{codeError}</p>}
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="px-5 py-2.5 rounded-md font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-100 transition-colors text-sm">
            Cancel
          </button>
          <button
            onClick={handleVerify}
            disabled={isProcessing || rawCode.length < 10}
            className="flex-1 py-2.5 bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold uppercase tracking-wide rounded-md hover:bg-amber-400 transition-colors"
          >
            {isProcessing ? 'Verifying...' : 'Unlock Listing'}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800">
          {!showEmailFlow ? (
            <button onClick={() => setShowEmailFlow(true)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              Lost your code? Request a new one by email →
            </button>
          ) : emailSent ? (
            <div>
              <p className="text-green-400 text-sm font-mono">Code sent! Check your email, then enter it above.</p>
              <button onClick={() => { setEmailSent(false); setShowEmailFlow(false); }} className="text-xs text-zinc-600 hover:text-zinc-400 mt-2 transition-colors">← Back</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-3">Request by Email</p>
              <div>
                <label className={labelClass}>Job Slug or URL</label>
                <input type="text" value={emailJobKey} onChange={e => setEmailJobKey(e.target.value)} placeholder="your-job-slug" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Owner Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className={inputClass} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowEmailFlow(false)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">← Back</button>
                <button
                  onClick={handleRequestCode}
                  disabled={isProcessing || !emailJobKey || !email}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 font-bold uppercase tracking-wide py-2 rounded text-sm transition-colors"
                >
                  {isProcessing ? 'Sending...' : 'Send Edit Code'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- ADMIN INLINE JOB EDIT FORM ---
const AdminJobEditForm = ({ job, onSave }) => {
  const [data, setData] = useState({
    title: job.title || '', company: job.company || '', company_url: job.company_url || '',
    city: job.city || '', state: job.state || '', postal_code: job.postal_code || '',
    apply_url: job.apply_url || '', contact_email: job.contact_email || '',
    payrangemin: job.payrangemin || '', payrangemax: job.payrangemax || '',
    paytype: job.paytype || 'Hourly', category: job.category || 'Full-time',
    status: job.status || 'pending',
  });
  const f = (k) => (e) => setData(prev => ({ ...prev, [k]: e.target.value }));
  const inputClass = 'w-full p-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 text-sm focus:border-amber-500 focus:outline-none';
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 sm:col-span-1">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Title</label>
        <input className={inputClass} value={data.title} onChange={f('title')} />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Company</label>
        <input className={inputClass} value={data.company} onChange={f('company')} />
      </div>
      <div className="col-span-2">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Company URL</label>
        <input className={inputClass} value={data.company_url} onChange={f('company_url')} placeholder="https://..." />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">City</label>
        <input className={inputClass} value={data.city} onChange={f('city')} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">State</label>
        <input className={inputClass} value={data.state} onChange={f('state')} maxLength={2} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Apply URL</label>
        <input className={inputClass} value={data.apply_url} onChange={f('apply_url')} placeholder="https://..." />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Contact Email</label>
        <input className={inputClass} value={data.contact_email} onChange={f('contact_email')} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Pay Min</label>
        <input className={inputClass} type="number" value={data.payrangemin} onChange={f('payrangemin')} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Pay Max</label>
        <input className={inputClass} type="number" value={data.payrangemax} onChange={f('payrangemax')} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Pay Type</label>
        <select className={inputClass} value={data.paytype} onChange={f('paytype')}>
          {['Hourly', 'Salary', 'Contract'].map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Status</label>
        <select className={inputClass} value={data.status} onChange={f('status')}>
          {['active', 'pending', 'rejected', 'filled', 'expired', 'archived'].map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div className="col-span-2 flex justify-end mt-2">
        <button onClick={() => onSave(data)} className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold uppercase tracking-wide py-2 px-6 rounded text-sm">Save Changes</button>
      </div>
    </div>
  );
};

// --- ADMIN DASHBOARD ---
const AdminDashboard = ({ jobs, onExit, onShowMessage, onRefresh, onAddJob }) => {
  const [activeTab, setActiveTab] = useState('aggregator');
  const [eventStats, setEventStats] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scrapedJobs, setScrapedJobs] = useState([]);
  const [scanQuery, setScanQuery] = useState('Crime Scene Cleanup');
  const [scanLocation, setScanLocation] = useState('Nationwide');
  const [scanHistory, setScanHistory] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoPublishUntil, setAutoPublishUntil] = useState('');
  const [scanEnabled, setScanEnabled] = useState(true);
  const [scanQueries, setScanQueries] = useState([]);
  const [scanDefaultLocation, setScanDefaultLocation] = useState('Nationwide');
  const [newQuery, setNewQuery] = useState('');
  const [editingQueryIdx, setEditingQueryIdx] = useState(null);
  const [editingQueryVal, setEditingQueryVal] = useState('');
  const [expandedRuns, setExpandedRuns] = useState({});
  const [runCandidates, setRunCandidates] = useState({});
  const [dbSearch, setDbSearch] = useState('');
  const [dbStatusFilter, setDbStatusFilter] = useState('all');
  const [editingJob, setEditingJob] = useState(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      dbService.listCandidates(),
      dbService.getScanHistory(),
      fetch('/api/health').then(r => r.json()),
      dbService.getSettings(),
    ]).then(([candidates, history, health, { settings }]) => {
      if (!isMounted) return;
      setScrapedJobs(candidates);
      setScanHistory(history.runs || []);
      setHealthData(health);
      setAutoPublish(settings?.auto_publish_jobs === 'true');
      setAutoPublishUntil(settings?.auto_publish_until || '');
      setScanEnabled(settings?.scan_enabled !== 'false');
      setScanDefaultLocation(settings?.scan_location || 'Nationwide');
      const raw = settings?.scan_queries || '';
      setScanQueries(raw.split(';').map(q => q.trim()).filter(Boolean));
    }).catch(err => console.error('Admin init failed:', err));
    return () => { isMounted = false; };
  }, []);

  const toggleAutoPublish = async (val) => {
    setAutoPublish(val);
    const updates = { auto_publish_jobs: String(val) };
    if (!val) { setAutoPublishUntil(''); updates.auto_publish_until = ''; }
    await dbService.updateSettings(updates).catch(() => setAutoPublish(!val));
  };

  const setAutoPublishUntilDate = async (val) => {
    setAutoPublishUntil(val);
    await dbService.updateSettings({ auto_publish_until: val }).catch(() => {});
  };

  const toggleScanEnabled = async (val) => {
    setScanEnabled(val);
    await dbService.updateSettings({ scan_enabled: String(val) }).catch(() => setScanEnabled(!val));
  };

  const saveQueries = async (queries) => {
    setScanQueries(queries);
    await dbService.updateSettings({ scan_queries: queries.join(';') }).catch(() => {});
  };

  const addQuery = async () => {
    const q = newQuery.trim();
    if (!q || scanQueries.includes(q)) return;
    setNewQuery('');
    await saveQueries([...scanQueries, q]);
  };

  const removeQuery = async (idx) => {
    await saveQueries(scanQueries.filter((_, i) => i !== idx));
  };

  const saveEditedQuery = async (idx) => {
    const q = editingQueryVal.trim();
    if (!q) return;
    const updated = scanQueries.map((v, i) => i === idx ? q : v);
    setEditingQueryIdx(null);
    await saveQueries(updated);
  };

  const saveLocation = async (val) => {
    setScanDefaultLocation(val);
    await dbService.updateSettings({ scan_location: val }).catch(() => {});
  };

  const runSourceScan = async () => {
    setIsScanning(true);
    try {
      const result = await dbService.scanJobs(scanQuery, scanLocation);
      setScrapedJobs(result.candidates || []);
      const history = await dbService.getScanHistory();
      setScanHistory(history.runs || []);
      onShowMessage('Scan Complete', `${result.candidates?.length || 0} candidate listings queued for review.`, 'info');
    } catch (error) {
      onShowMessage('Scan Failed', error.message, 'info');
    } finally {
      setIsScanning(false);
    }
  };

  const approveJob = async (jobToImport) => {
    try {
      const result = await dbService.approveCandidate(jobToImport.id);
      setScrapedJobs(prev => prev.filter(j => j.id !== jobToImport.id));
      await onRefresh?.();
      onShowMessage('Import Successful', `Added ${result.job.title} to the live database.`, 'info');
    } catch (error) {
      onShowMessage('Import Blocked', error.message, 'info');
    }
  };

  const rejectJob = async (id) => {
    try {
      await dbService.rejectCandidate(id);
      setScrapedJobs(prev => prev.filter(j => j.id !== id));
    } catch (error) {
      onShowMessage('Reject Failed', error.message, 'info');
    }
  };

  const parseAndPublishJob = async (id) => {
    setScrapedJobs(prev => prev.map(j => j.id === id ? { ...j, _parsing: true } : j));
    try {
      const result = await dbService.parseAndPublish(id);
      setScrapedJobs(prev => prev.filter(j => j.id !== id));
      await onRefresh?.();
      onShowMessage('Parsed & Published', `"${result.job?.title}" is now live.`, 'info');
    } catch (error) {
      setScrapedJobs(prev => prev.map(j => j.id === id ? { ...j, _parsing: false } : j));
      onShowMessage('Parse Failed', error.message, 'info');
    }
  };

  const updateLiveJobStatus = async (job, status) => {
    try {
      await dbService.updateJobStatus(job.id, status);
      await onRefresh?.();
      onShowMessage(
        status === 'active' ? 'Listing Published' : 'Listing Updated',
        `${job.title} is now ${status}.`,
        'info'
      );
    } catch (error) {
      onShowMessage('Update Failed', error.message, 'info');
    }
  };

  return (
    <div className="max-w-7xl mx-auto bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl mt-8">
      <div className="bg-zinc-950 p-6 border-b border-zinc-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-amber-500" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-tight">Command Center</h2>
            <p className="text-xs text-zinc-500 tracking-widest uppercase font-mono">Admin Privileges Active</p>
          </div>
        </div>
        <button onClick={onExit} className="flex items-center text-zinc-400 hover:text-red-500 transition-colors text-sm font-bold uppercase tracking-wide">
          <LogOut className="w-4 h-4 mr-2" aria-hidden="true" /> Disconnect
        </button>
      </div>

      <div className="flex border-b border-zinc-800 bg-zinc-950/50" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'aggregator'}
          onClick={() => setActiveTab('aggregator')}
          className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'aggregator' ? 'text-amber-500 border-b-2 border-amber-500 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Radar className="w-4 h-4 inline mr-2 mb-0.5" aria-hidden="true" /> Aggregator Network
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'database'}
          onClick={() => setActiveTab('database')}
          className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'database' ? 'text-amber-500 border-b-2 border-amber-500 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Database className="w-4 h-4 inline mr-2 mb-0.5" aria-hidden="true" /> Live Database ({jobs.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'analytics'}
          onClick={() => {
            setActiveTab('analytics');
            if (!eventStats) dbService.getEvents().then(d => setEventStats(d)).catch(() => {});
            if (!analyticsData) dbService.getAnalytics().then(d => setAnalyticsData(d)).catch(() => {});
          }}
          className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'analytics' ? 'text-amber-500 border-b-2 border-amber-500 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Activity className="w-4 h-4 inline mr-2 mb-0.5" aria-hidden="true" /> Analytics
        </button>
      </div>

      <div className="p-8 min-h-[500px]">
        {activeTab === 'aggregator' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-amber-500" /> Scheduled Scan
                  </h3>
                  <button
                    onClick={() => toggleScanEnabled(!scanEnabled)}
                    aria-pressed={scanEnabled}
                    aria-label={scanEnabled ? 'Disable scheduled scan' : 'Enable scheduled scan'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${scanEnabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${scanEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Daily at <span className="text-zinc-100 font-mono">9:00 AM UTC</span> {!scanEnabled && <span className="text-red-400 font-bold">(disabled)</span>}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">Last run: {healthData?.last_scan_at ? new Date(healthData.last_scan_at).toLocaleString() : 'Never'}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <div>
                    <p className="text-xs font-bold text-zinc-300">Auto-publish high confidence</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Publish jobs ≥92% confidence + company + apply link</p>
                  </div>
                  <button
                    onClick={() => toggleAutoPublish(!autoPublish)}
                    aria-pressed={autoPublish}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoPublish ? 'bg-amber-500' : 'bg-zinc-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${autoPublish ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {autoPublish && (
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <p className="text-xs text-zinc-400">Stop auto-publish after</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">{autoPublishUntil ? `Expires ${new Date(autoPublishUntil).toLocaleDateString()}` : 'No end date'}</p>
                    </div>
                    <input
                      type="date"
                      value={autoPublishUntil}
                      onChange={e => setAutoPublishUntilDate(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Manual Scan</h3>
                <div className="flex gap-2 mb-3">
                  <input type="text" value={scanQuery} onChange={e => setScanQuery(e.target.value)} placeholder="Keywords" className="flex-1 min-w-0 p-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 text-xs font-mono focus:border-amber-500 focus:outline-none" />
                  <input type="text" value={scanLocation} onChange={e => setScanLocation(e.target.value)} placeholder="Location" className="w-28 p-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 text-xs font-mono focus:border-amber-500 focus:outline-none" />
                </div>
                <button onClick={runSourceScan} disabled={isScanning} className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-500 font-bold uppercase tracking-wide py-2 px-4 rounded text-xs flex items-center justify-center gap-2">
                  {isScanning ? <><Activity className="w-3.5 h-3.5 animate-spin" /> Scanning...</> : <><Radar className="w-3.5 h-3.5" /> Run Scan Now</>}
                </button>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Daily Scan Queries</h3>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Default location</label>
                  <input
                    type="text"
                    value={scanDefaultLocation}
                    onChange={e => setScanDefaultLocation(e.target.value)}
                    onBlur={e => saveLocation(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveLocation(e.target.value)}
                    className="w-32 p-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 text-xs font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2 mb-3">
                {scanQueries.length === 0 && (
                  <p className="text-zinc-600 text-xs font-mono">No queries configured. Add one below.</p>
                )}
                {scanQueries.map((q, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {editingQueryIdx === idx ? (
                      <>
                        <input
                          autoFocus
                          type="text"
                          value={editingQueryVal}
                          onChange={e => setEditingQueryVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditedQuery(idx); if (e.key === 'Escape') setEditingQueryIdx(null); }}
                          className="flex-1 p-1.5 bg-zinc-900 border border-amber-500 rounded text-zinc-100 text-xs font-mono focus:outline-none"
                        />
                        <button onClick={() => saveEditedQuery(idx)} className="text-[10px] font-bold text-amber-400 hover:text-amber-300 uppercase tracking-widest shrink-0">Save</button>
                        <button onClick={() => setEditingQueryIdx(null)} className="text-[10px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest shrink-0">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-xs text-zinc-300 font-mono bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5">{q}</span>
                        <button onClick={() => { setEditingQueryIdx(idx); setEditingQueryVal(q); }} className="text-[10px] text-zinc-500 hover:text-amber-400 uppercase tracking-widest shrink-0">Edit</button>
                        <button onClick={() => removeQuery(idx)} className="text-zinc-600 hover:text-red-500 transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newQuery}
                  onChange={e => setNewQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addQuery()}
                  placeholder="Add a search query..."
                  className="flex-1 p-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 text-xs font-mono focus:border-amber-500 focus:outline-none placeholder-zinc-600"
                />
                <button onClick={addQuery} disabled={!newQuery.trim()} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 font-bold uppercase tracking-wide py-2 px-4 rounded text-xs flex items-center gap-1.5">
                  <PlusCircle className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {scrapedJobs.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 border-t border-zinc-800 pt-4">
                  Pending Review ({scrapedJobs.length})
                </h3>
                <div className="space-y-3">
                  {scrapedJobs.map(job => {
                    const payload = job.payload || {};
                    // Prefer DB row fields (set from structured hints like Adzuna) over payload
                    // which may have been emptied by Claude not finding them in the snippet text.
                    const title = job.title || payload.title || '';
                    const company = job.company || payload.company || '';
                    const city = job.city || payload.city || '';
                    const state = job.state || payload.state || '';
                    const confidence = Math.round(Number(job.confidence || payload.confidence || 0) * 100);
                    const sourceUrl = job.source_url || payload.source_url || '';
                    const hasApply = payload.apply_url || payload.contact_email || sourceUrl;
                    const missingBlocking = [];
                    if (!company) missingBlocking.push('company');
                    if (!hasApply) missingBlocking.push('apply link');
                    const missingOptional = [];
                    if (!title) missingOptional.push('title');
                    if (!city && !state) missingOptional.push('location');
                    if (!payload.description) missingOptional.push('description');
                    const isReady = missingBlocking.length === 0;
                    const isExpanded = job._expanded;
                    const discoveredDate = job.discovered_at ? new Date(job.discovered_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
                    return (
                      <div key={job.id} className={`bg-zinc-950 border rounded-lg transition-colors ${isExpanded ? 'border-amber-500/40' : 'border-zinc-800 hover:border-amber-500/20'}`}>
                        <div className="p-4 flex items-start justify-between gap-3">
                          <button
                            onClick={() => setScrapedJobs(prev => prev.map(j => j.id === job.id ? { ...j, _expanded: !j._expanded } : j))}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h4 className="text-sm font-bold text-zinc-100">{title || <span className="text-red-400 italic">No title</span>}</h4>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${confidence >= 80 ? 'bg-green-500/15 text-green-400' : confidence >= 60 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{confidence}%</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isReady ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                {isReady ? '✓ Ready' : `✗ ${missingBlocking.join(', ')}`}
                              </span>
                              {missingOptional.length > 0 && <span className="text-[10px] text-zinc-500 font-mono">missing: {missingOptional.join(', ')}</span>}
                            </div>
                            <p className="text-xs text-zinc-400">{company || <span className="text-red-400 italic">Unknown company</span>} • {[city, state].filter(Boolean).join(', ') || <span className="text-zinc-600 italic">No location</span>}</p>
                            {discoveredDate && <p className="text-[10px] text-zinc-600 mt-1">Discovered {discoveredDate}</p>}
                          </button>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => rejectJob(job.id)} aria-label={`Reject ${payload.title}`} className="p-2 bg-zinc-900 hover:bg-red-500/20 text-zinc-500 hover:text-red-500 rounded border border-zinc-800"><X className="w-4 h-4" /></button>
                            <button
                              onClick={() => parseAndPublishJob(job.id)}
                              disabled={job._parsing}
                              aria-label={`Add ${payload.title} to database`}
                              title="Fetch source page, AI-parse into SEO listing, and publish"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-amber-400 hover:text-amber-300 rounded border border-amber-500/30 text-[11px] font-bold transition-colors"
                            >
                              <Wand2 className="w-3.5 h-3.5" />
                              {job._parsing ? 'Parsing…' : 'Add to Database'}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-zinc-800 p-4 space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                              {(() => {
                                const applyUrl = payload.apply_url;
                                const applyLabel = applyUrl
                                  ? 'Apply URL'
                                  : sourceUrl
                                    ? `Apply via ${job.source_name || payload.source_name || 'Source'}`
                                    : 'Apply URL';
                                const applyVal = applyUrl || sourceUrl || null;
                                return [
                                  { label: applyLabel, val: applyVal, fallback: !applyUrl && !!sourceUrl },
                                  { label: 'Contact Email', val: payload.contact_email },
                                  { label: 'Pay', val: payload.pay_min || payload.pay_max ? `$${payload.pay_min || '?'}–$${payload.pay_max || '?'} ${payload.pay_type || ''}` : null },
                                  { label: 'Employment', val: payload.employment_type },
                                  { label: 'Source', val: sourceUrl },
                                ].map(({ label, val, fallback }) => (
                                  <div key={label}>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${fallback ? 'text-amber-600' : 'text-zinc-600'}`}>{label}{fallback ? ' (fallback)' : ''}</p>
                                    {val
                                      ? <p className="text-zinc-300 font-mono break-all">{val.length > 60 ? <a href={val} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300">{val.slice(0, 60)}…</a> : val}</p>
                                      : <p className="text-red-400 italic">Missing</p>}
                                  </div>
                                ));
                              })()}
                            </div>
                            {payload.description && (
                              <div>
                                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Description preview</p>
                                <div className="text-zinc-400 leading-relaxed max-h-40 overflow-y-auto prose-sm" dangerouslySetInnerHTML={{ __html: payload.description.slice(0, 600) + (payload.description.length > 600 ? '…' : '') }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {scanHistory && scanHistory.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 border-t border-zinc-800 pt-4">Scan History</h3>
                <div className="space-y-2">
                  {scanHistory.map(run => {
                    const isOpen = expandedRuns[run.id];
                    const candidates = runCandidates[run.id];
                    return (
                      <div key={run.id} className={`bg-zinc-950 border rounded-lg transition-colors ${isOpen ? 'border-zinc-700' : 'border-zinc-800'}`}>
                        <button
                          onClick={async () => {
                            const nowOpen = !isOpen;
                            setExpandedRuns(prev => ({ ...prev, [run.id]: nowOpen }));
                            if (nowOpen && !candidates) {
                              const rows = await dbService.getCandidatesByRun(run.id).catch(() => []);
                              setRunCandidates(prev => ({ ...prev, [run.id]: rows }));
                            }
                          }}
                          className="w-full px-4 py-3 flex items-center justify-between text-left"
                        >
                          <div>
                            <p className="text-xs text-zinc-300 font-mono">{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</p>
                            <p className="text-[10px] text-zinc-600 mt-0.5 truncate max-w-xs">{run.query}</p>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-mono shrink-0 ml-3">
                            <span className="text-zinc-500">{run.discovered_count ?? 0} found</span>
                            <span className="text-amber-400">{run.candidate_count ?? 0} queued</span>
                            <span className="text-green-400">{run.published_count ?? 0} published</span>
                            <span className={`font-bold uppercase ${run.status === 'complete' ? 'text-green-500' : run.status === 'running' ? 'text-amber-500' : 'text-red-400'}`}>{run.status}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        {isOpen && (
                          <div className="border-t border-zinc-800 p-3 space-y-2">
                            {!candidates
                              ? <p className="text-zinc-600 text-xs font-mono text-center py-2">Loading…</p>
                              : candidates.length === 0
                                ? <p className="text-zinc-600 text-xs font-mono text-center py-2">No candidates stored for this run.</p>
                                : candidates.map(c => {
                                  const p = c.payload || {};
                                  const conf = Math.round(Number(c.confidence || 0) * 100);
                                  const statusColor = { pending: 'text-amber-400', approved: 'text-green-400', rejected: 'text-zinc-600' }[c.status] || 'text-zinc-500';
                                  return (
                                    <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-900 rounded border border-zinc-800 text-xs">
                                      <span className={`font-mono shrink-0 ${conf >= 80 ? 'text-green-400' : conf >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{conf}%</span>
                                      <span className="text-zinc-200 flex-1 truncate">{p.title || c.source_url || '—'}</span>
                                      <span className="text-zinc-500 shrink-0">{p.company || ''}</span>
                                      <span className={`font-bold uppercase shrink-0 ${statusColor}`}>{c.status}</span>
                                      {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="text-amber-500 hover:text-amber-400 shrink-0">↗</a>}
                                    </div>
                                  );
                                })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'analytics' ? (
          <div role="tabpanel" className="space-y-6">
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Payment Funnel — Last 30 Days</h3>
              {!eventStats ? (
                <p className="text-zinc-500 font-mono text-sm">Loading...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { key: 'submit_click', label: 'Submit Clicks', color: 'text-zinc-100' },
                    { key: 'payment_initiated', label: 'Stripe Redirects', color: 'text-amber-400' },
                    { key: 'payment_completed', label: 'Payments Returned', color: 'text-blue-400' },
                    { key: 'job_posted', label: 'Jobs Posted', color: 'text-green-400' },
                  ].map(({ key, label, color }) => {
                    const row = eventStats.events?.find(e => e.event === key);
                    return (
                      <div key={key} className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                        <p className={`text-3xl font-black font-mono ${color}`}>{row?.count ?? 0}</p>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">{label}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Job Engagement — Last 30 Days</h3>
              {!analyticsData ? (
                <p className="text-zinc-500 font-mono text-sm">Loading...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Top by Views</h4>
                    {analyticsData.top_views?.length === 0
                      ? <p className="text-zinc-600 text-xs font-mono">No data yet</p>
                      : analyticsData.top_views?.map(row => (
                        <div key={row.slug} className="flex justify-between items-center py-1.5 border-b border-zinc-800/50 last:border-0">
                          <p className="text-xs text-zinc-300 truncate max-w-[200px]">{row.title || row.slug}</p>
                          <span className="text-xs font-mono text-amber-400 ml-2 shrink-0">{row.views}</span>
                        </div>
                      ))}
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Top by Apply Clicks</h4>
                    {analyticsData.top_clicks?.length === 0
                      ? <p className="text-zinc-600 text-xs font-mono">No data yet</p>
                      : analyticsData.top_clicks?.map(row => (
                        <div key={row.slug} className="flex justify-between items-center py-1.5 border-b border-zinc-800/50 last:border-0">
                          <p className="text-xs text-zinc-300 truncate max-w-[200px]">{row.title || row.slug}</p>
                          <span className="text-xs font-mono text-green-400 ml-2 shrink-0">{row.clicks}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Scan Effectiveness (30d)</h4>
                {analyticsData?.scan ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Runs', val: analyticsData.scan.runs ?? 0, color: 'text-zinc-300' },
                      { label: 'Discovered', val: analyticsData.scan.discovered ?? 0, color: 'text-zinc-300' },
                      { label: 'Candidates', val: analyticsData.scan.candidates ?? 0, color: 'text-amber-400' },
                      { label: 'Published', val: analyticsData.scan.published ?? 0, color: 'text-green-400' },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <p className={`text-2xl font-black font-mono ${color}`}>{val}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-zinc-600 text-xs font-mono">No scan data</p>}
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Live DB by Status</h4>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { s: 'active', color: 'text-green-400' },
                    { s: 'pending', color: 'text-amber-400' },
                    { s: 'rejected', color: 'text-zinc-500' },
                    { s: 'archived', color: 'text-zinc-600' },
                    { s: 'expired', color: 'text-zinc-600' },
                    { s: 'filled', color: 'text-blue-400' },
                  ].map(({ s, color }) => (
                    <div key={s}>
                      <p className={`text-2xl font-black font-mono ${color}`}>{jobs.filter(j => j.status === s).length}</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4" role="tabpanel">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="search"
                  value={dbSearch}
                  onChange={e => setDbSearch(e.target.value)}
                  placeholder="Search title, company..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <select
                value={dbStatusFilter}
                onChange={e => setDbStatusFilter(e.target.value)}
                className="p-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none appearance-none"
              >
                {['all', 'active', 'pending', 'rejected', 'archived', 'expired', 'filled'].map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
                ))}
              </select>
              {onAddJob && (
                <button onClick={onAddJob} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold uppercase tracking-wide py-2 px-4 rounded text-xs">
                  <PlusCircle className="w-4 h-4" /> New Job
                </button>
              )}
            </div>

            {editingJob && (
              <div className="bg-zinc-950 border border-amber-500/40 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-amber-500 uppercase tracking-widest">Edit Job: {editingJob.title}</h3>
                  <button onClick={() => setEditingJob(null)} className="text-zinc-500 hover:text-zinc-300 text-xs uppercase tracking-widest">Cancel</button>
                </div>
                <AdminJobEditForm
                  job={editingJob}
                  onSave={async (data) => {
                    try {
                      await dbService.updateJobFull(editingJob.id, data);
                      setEditingJob(null);
                      await onRefresh?.();
                      onShowMessage('Updated', `${data.title || editingJob.title} saved.`, 'info');
                    } catch (err) {
                      onShowMessage('Update Failed', err.message, 'info');
                    }
                  }}
                />
              </div>
            )}

            {(() => {
              const filtered = jobs.filter(job => {
                if (dbStatusFilter !== 'all' && job.status !== dbStatusFilter) return false;
                if (dbSearch) {
                  const q = dbSearch.toLowerCase();
                  return (job.title || '').toLowerCase().includes(q) || (job.company || '').toLowerCase().includes(q);
                }
                return true;
              });
              if (filtered.length === 0) return <p className="text-zinc-500 text-sm font-mono text-center py-12">No records match.</p>;
              return (
                <div className="space-y-2">
                  {filtered.map(job => {
                    const statusColor = { active: 'bg-green-500/15 text-green-400', pending: 'bg-amber-500/15 text-amber-400', filled: 'bg-blue-500/15 text-blue-400' }[job.status] || 'bg-zinc-800 text-zinc-400';
                    return (
                      <div key={job.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex justify-between items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-zinc-100 truncate">{job.title}</h4>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm shrink-0 ${statusColor}`}>{job.status}</span>
                          </div>
                          <p className="text-xs text-zinc-500 font-mono">{job.company} • {[job.city, job.state].filter(Boolean).join(', ') || 'No location'}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <button onClick={() => setEditingJob(job)} className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-amber-400 transition-colors">Edit</button>
                          {job.status !== 'active' && (
                            <button onClick={() => updateLiveJobStatus(job, 'active')} className="text-[10px] font-bold uppercase tracking-widest text-green-400 hover:text-green-300 transition-colors">Publish</button>
                          )}
                          {job.status === 'active' && (
                            <button onClick={() => updateLiveJobStatus(job, 'filled')} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors">Fill</button>
                          )}
                          {job.status === 'active' && (
                            <button onClick={() => updateLiveJobStatus(job, 'expired')} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">Expire</button>
                          )}
                          {job.status === 'pending' && (
                            <button onClick={() => updateLiveJobStatus(job, 'rejected')} className="text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors">Reject</button>
                          )}
                          <button
                            onClick={async () => {
                              try { await dbService.deleteJob(job.id); await onRefresh?.(); }
                              catch (error) { onShowMessage('Delete Failed', error.message, 'info'); }
                            }}
                            aria-label={`Delete ${job.title}`}
                            className="text-zinc-600 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// --- JOB DETAIL PAGE (SPA route for /jobs/:slug) ---
const JobDetailPage = ({ slug, onBack }) => {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }
    apiRequest(`/api/jobs/${encodeURIComponent(slug)}`)
      .then(data => {
        const j = data.job || null;
        setJob(j);
        if (!j) { setNotFound(true); return; }
        dbService.logEvent('job_view', { slug: j.slug, title: j.title });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="flex justify-center py-32">
      <Activity className="w-8 h-8 text-amber-500 animate-spin" aria-label="Loading" />
    </div>
  );

  if (notFound || !job) return (
    <div className="max-w-2xl mx-auto mt-24 text-center">
      <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-100 mb-3">Listing Not Found</h2>
      <p className="text-zinc-400 mb-6 font-mono text-sm">This posting may have been filled or removed.</p>
      <button onClick={onBack} className="text-amber-500 font-bold uppercase tracking-widest text-sm hover:text-amber-400">← Back to Jobs</button>
    </div>
  );

  const apply = applyInfo(job);
  const payText = formatPay(job.payrangemin, job.payrangemax, job.paytype);
  const rawContent = job.content || job.description || '';
  const isHtml = rawContent.trimStart().startsWith('<');

  const fireApplyClick = () => dbService.logEvent('apply_click', { slug: job.slug, title: job.title, apply_type: apply.type });

  const ApplyButton = ({ className }) => {
    if (apply.type === 'url') {
      return (
        <a href={apply.href} target="_blank" rel="noopener noreferrer" className={className} onClick={fireApplyClick}>
          {apply.label}
        </a>
      );
    }
    if (apply.type === 'email') {
      return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Apply by Email</p>
          <a href={apply.href} onClick={fireApplyClick} className="text-amber-400 hover:text-amber-300 font-mono text-sm transition-colors">{apply.display}</a>
        </div>
      );
    }
    if (apply.type === 'phone') {
      return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Contact to Apply</p>
          <a href={apply.href} onClick={fireApplyClick} className="text-zinc-200 hover:text-amber-400 font-mono text-sm transition-colors">{apply.display}</a>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-3xl mx-auto mt-8">
      <button onClick={onBack} className="text-zinc-500 hover:text-amber-400 text-xs font-bold uppercase tracking-widest mb-8 flex items-center gap-1 transition-colors">
        ← Back to all jobs
      </button>
      <p className="text-amber-500 text-xs font-bold tracking-widest uppercase mb-2">{job.category}</p>
      <h1 className="text-3xl md:text-4xl font-black tracking-tight text-zinc-100 mb-4 leading-tight">{job.title}</h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-zinc-400 text-sm mb-6">
        <span className="flex items-center gap-1.5">
          <Building className="w-4 h-4 text-zinc-500" />
          {job.company_url
            ? <a href={job.company_url} target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 transition-colors">{job.company}</a>
            : <span className="text-zinc-300">{job.company}</span>}
        </span>
        {(job.city || job.state) && (
          <span className="flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-zinc-500" />
            <a href={`https://www.google.com/maps/search/${encodeURIComponent([job.city, job.state].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
              {[job.city, job.state].filter(Boolean).join(', ')}
            </a>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Banknote className="w-4 h-4 text-zinc-500" />
          <span className="text-green-400">{payText}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-zinc-500" />
          {timeAgo(job.created)}
        </span>
      </div>

      <ApplyButton className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wide px-8 py-3 rounded-md transition mb-8" />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        {isHtml
          ? <div className="job-description" dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawContent) }} />
          : <div className="text-zinc-400 whitespace-pre-wrap text-sm leading-relaxed">{rawContent}</div>}
      </div>

      <ApplyButton className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wide px-8 py-3 rounded-md transition mb-4" />
    </div>
  );
};

// --- WHY POST HERE PAGE ---
const WhyPostHerePage = ({ onPostJob }) => {
  const features = [
    {
      icon: <Search className="w-6 h-6 text-amber-500" />,
      title: 'Your Own Google-Indexed Page',
      body: 'Every listing gets a dedicated /jobs/slug URL that Google crawls within 24 hours. Your opening appears in Google Search, Google Jobs, and is submitted automatically to the Google Indexing API.',
    },
    {
      icon: <Cpu className="w-6 h-6 text-amber-500" />,
      title: 'AI-Optimized for the New Search',
      body: 'Job descriptions are rewritten by Claude AI into structured, semantic HTML — optimized not just for Google, but for ChatGPT, Gemini, and Perplexity. When someone asks an AI "where can I find biohazard cleanup jobs?" your listing shows up.',
    },
    {
      icon: <Target className="w-6 h-6 text-amber-500" />,
      title: 'Zero Noise. Niche Audience.',
      body: 'This board exists for one industry. Every visitor is a biohazard remediation or crime scene cleanup professional actively looking for work. No irrelevant applications from people who didn\'t read the posting.',
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-amber-500" />,
      title: 'Edit Anytime. No Account Needed.',
      body: 'You get a private edit code after posting. Update your listing, change contact info, or take it down — anytime, from any device. No account, no password, no support ticket.',
    },
    {
      icon: <Clock className="w-6 h-6 text-amber-500" />,
      title: '45-Day Active Listing',
      body: 'Your job stays live and indexed for 45 days. Re-post anytime if the role isn\'t filled. Listings that stay active longer rank higher in search over time.',
    },
    {
      icon: <Briefcase className="w-6 h-6 text-amber-500" />,
      title: 'Structured Data for Job Boards',
      body: 'Every listing includes JSON-LD schema markup — the structured data Google requires to surface jobs in the dedicated Jobs carousel. IndeedBot, LinkedInBot, and ZipRecruiter crawlers can index it too.',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto mt-8 pb-24">
      <div className="mb-12">
        <span className="inline-block py-1 px-3 rounded-full bg-zinc-900 border border-zinc-800 text-amber-500 text-xs font-bold tracking-widest uppercase mb-4">For Employers</span>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-zinc-100 leading-[1.1] mb-6">
          Reach the Only Professionals<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600">Who Actually Do This Work</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed font-mono mb-8">
          Hiring a biohazard remediation tech isn't like hiring a general laborer. You need someone certified, experienced, and serious. This is the only job board built for them.
        </p>
        <button
          onClick={onPostJob}
          className="inline-flex items-center gap-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wide py-4 px-8 rounded-lg text-sm transition-colors"
        >
          <PlusCircle className="w-5 h-5" /> Post a Job
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
        {features.map(({ icon, title, body }) => (
          <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-amber-500/30 transition-colors">
            <div className="mb-4">{icon}</div>
            <h3 className="text-base font-bold text-zinc-100 mb-3">{title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 md:p-12 text-center">
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-zinc-100 mb-4">Ready to Find Your Next Technician?</h2>
        <p className="text-zinc-400 font-mono mb-8 max-w-lg mx-auto">Post in under 2 minutes. AI handles the formatting. Your listing is live and indexed same day.</p>
        <button
          onClick={onPostJob}
          className="inline-flex items-center gap-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wide py-4 px-10 rounded-lg text-sm transition-colors"
        >
          <PlusCircle className="w-5 h-5" /> Post a Job Now
        </button>
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [jobDetailSlug] = useState(() => {
    const m = window.location.pathname.match(/^\/jobs\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : '';
  });
  const [currentView, setCurrentView] = useState(() => {
    if (urlParams.get('edit')) return 'edit';
    if (window.location.pathname === '/post-success') return 'submitting';
    if (/^\/jobs\/[^/]+$/.test(window.location.pathname)) return 'job-detail';
    if (window.location.pathname === '/why-post-here') return 'why-post-here';
    return 'home';
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [editTarget, setEditTarget] = useState(() => urlParams.get('edit') || '');
  const [editPrefilledCode, setEditPrefilledCode] = useState('');
  const [postedJob, setPostedJob] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info', onConfirm: null });
  const [search, setSearch] = useState(() => urlParams.get('search') || '');
  const [filters, setFilters] = useState({ state: 'All', city: 'All', paytype: 'All', category: 'All', company: 'All', sort: 'Newest' });

  const showMessage = useCallback((title, message, type = 'info') => {
    setModal({ isOpen: true, title, message, type, onConfirm: () => setModal(prev => ({ ...prev, isOpen: false })) });
  }, []);

  const loadJobs = useCallback(async (adminMode = isAdmin) => {
    setIsLoading(true);
    try {
      const loadedJobs = await dbService.listJobs({ admin: adminMode });
      setJobs(loadedJobs);
    } catch (error) {
      console.error('Job sync failed:', error);
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    document.title = 'CrimeSceneCleanerJobs — Find Your Next Mission';
  }, []);

  useEffect(() => {
    if (currentView !== 'submitting') return;
    const pending = sessionStorage.getItem('pendingJob');
    if (!pending) { setCurrentView('post'); return; }
    sessionStorage.removeItem('pendingJob');
    dbService.logEvent('payment_completed');
    submitJob(JSON.parse(pending));
  }, []);

  useEffect(() => {
    loadJobs(isAdmin);
  }, [isAdmin, loadJobs]);

  const options = useMemo(() => ({
    states: [...new Set(jobs.map(j => j.state).filter(Boolean))].sort(),
    cities: [...new Set(jobs.map(j => j.city).filter(Boolean))].sort(),
    categories: [...new Set(jobs.map(j => j.category).filter(Boolean))].sort(),
    companies: [...new Set(jobs.map(j => j.company).filter(Boolean))].sort(),
    paytypes: [...new Set(jobs.map(j => j.paytype).filter(Boolean))].sort(),
  }), [jobs]);

  const filteredJobs = useMemo(() => {
    let result = jobs.filter(job => {
      if (search) {
        const q = search.toLowerCase();
        const text = `${job.title} ${job.company} ${job.city} ${job.state} ${job.content}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (filters.state !== 'All' && job.state !== filters.state) return false;
      if (filters.city !== 'All' && job.city !== filters.city) return false;
      if (filters.paytype !== 'All' && job.paytype !== filters.paytype) return false;
      if (filters.category !== 'All' && job.category !== filters.category) return false;
      if (filters.company !== 'All' && job.company !== filters.company) return false;
      return true;
    });
    result.sort((a, b) => {
      if (filters.sort === 'Newest') return new Date(b.created || 0) - new Date(a.created || 0);
      if (filters.sort === 'Oldest') return new Date(a.created || 0) - new Date(b.created || 0);
      if (filters.sort === 'High to Low') return (Number(b.payrangemax) || 0) - (Number(a.payrangemax) || 0);
      if (filters.sort === 'Low to High') return (Number(a.payrangemin) || 0) - (Number(b.payrangemin) || 0);
      return 0;
    });
    return result;
  }, [jobs, search, filters]);

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const resetFilters = () => {
    setSearch('');
    setFilters({ state: 'All', city: 'All', paytype: 'All', category: 'All', company: 'All', sort: 'Newest' });
  };

  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  const authorizeAdmin = async (token) => {
    if (!token?.trim()) return;
    setAdminLoginLoading(true);
    setAdminLoginError('');
    try {
      const ok = await dbService.verifyAdminToken(token.trim());
      if (!ok) { setAdminLoginError('Invalid token.'); return; }
      localStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
      setAdminToken(token.trim());
      setIsAdmin(true);
      setCurrentView('admin');
    } catch (err) {
      setAdminLoginError(err.message || 'Too many attempts. Try again later.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const submitJob = async (newJob, { publish } = {}) => {
    try {
      const result = await dbService.addJob(newJob, { publish: publish ?? isAdmin });
      const saved = result.job;
      if (saved.status === 'active' && saved.slug) {
        dbService.logEvent('job_posted', { slug: saved.slug });
        setPostedJob({ slug: saved.slug, editCode: result.edit?.edit_code || '', emailed: result.edit?.emailed, emailError: result.edit?.email?.error || '' });
        setCurrentView('posted');
        return;
      }
      await loadJobs(isAdmin);
      setCurrentView('home');
      showMessage('Queued for Review', 'Your listing has been saved and queued for admin approval.');
    } catch (error) {
      showMessage('Save Failed', error.message, 'info');
    }
  };

  const handleAddJob = async (newJob) => {
    if (isAdmin) { await submitJob(newJob); return; }
    sessionStorage.setItem('pendingJob', JSON.stringify(newJob));
    dbService.logEvent('payment_initiated');
    window.location.href = 'https://buy.stripe.com/6oU14mbCsbzo2sOb7G24000';
  };

  const handleAddJobDirect = async (newJob) => {
    await submitJob(newJob);
  };

  const requestDeleteJob = (id) => {
    setModal({
      isOpen: true, title: 'Confirm Deletion',
      message: 'Are you sure you want to permanently delete this record?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await dbService.deleteJob(id);
          await loadJobs(isAdmin);
        } catch (error) {
          showMessage('Delete Failed', error.message, 'info');
        } finally {
          setModal(prev => ({ ...prev, isOpen: false }));
        }
      },
      onCancel: () => setModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200">
      <TacticalModal {...modal} />

      <header>
        <nav className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800" aria-label="Main Navigation">
          <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600" aria-hidden="true"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center group" aria-label="CrimeSceneCleanerJobs home" onClick={(e) => { e.preventDefault(); setCurrentView('home'); }}>
              <TriangleAlert className="w-7 h-7 text-amber-500 mr-3 group-hover:rotate-12 transition-transform" aria-hidden="true" />
              <span className="font-black text-xl tracking-tighter uppercase text-zinc-100 hidden sm:block">
                CrimeScene<span className="text-amber-500">Cleaner</span>Jobs
              </span>
            </a>
            <div className="flex items-center gap-2">
              <a
                href="/why-post-here"
                onClick={e => { e.preventDefault(); window.history.pushState({}, '', '/why-post-here'); setCurrentView('why-post-here'); }}
                className="hidden md:block text-zinc-400 hover:text-zinc-100 px-3 py-2 text-xs font-bold uppercase tracking-wide transition"
              >
                Why Post Here?
              </a>
              <button
                onClick={() => setCurrentView('post')}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 px-4 sm:px-5 py-2 rounded font-bold text-sm uppercase tracking-wide transition flex items-center"
              >
                <PlusCircle className="w-4 h-4 sm:mr-2 text-amber-500" aria-hidden="true" /> <span className="hidden sm:inline">Post a Job</span>
              </button>
              <button
                onClick={() => setCurrentView('edit')}
                className="border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-100 px-4 py-2 rounded font-bold text-xs uppercase tracking-wide transition"
              >
                Edit Listing
              </button>
            </div>
          </div>
        </nav>
      </header>

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {currentView === 'login' ? (
          <div className="max-w-sm mx-auto mt-20 bg-zinc-900 p-8 border border-zinc-800 rounded-xl shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <ShieldAlert className="w-7 h-7 text-zinc-500" aria-hidden="true" />
              <h2 className="text-lg font-black uppercase tracking-widest text-zinc-100">Admin Access</h2>
            </div>
            <form onSubmit={e => { e.preventDefault(); authorizeAdmin(e.target.token.value); }}>
              <input
                name="token"
                type="password"
                placeholder="Admin token"
                autoFocus
                disabled={adminLoginLoading}
                className="w-full p-2.5 mb-4 bg-zinc-950 border border-zinc-700 rounded-md text-zinc-100 font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors disabled:opacity-50"
              />
              {adminLoginError && <p className="text-red-400 text-xs font-mono mb-3">{adminLoginError}</p>}
              <button type="submit" disabled={adminLoginLoading} className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 font-bold uppercase tracking-wide py-2.5 rounded border border-zinc-700 transition-colors">
                {adminLoginLoading ? 'Verifying...' : 'Authorize'}
              </button>
            </form>
            <button onClick={() => setCurrentView('home')} className="mt-4 text-xs text-zinc-600 hover:text-zinc-400 uppercase tracking-widest w-full text-center transition-colors">
              Cancel
            </button>
          </div>
        ) : currentView === 'admin' && isAdmin ? (
          <AdminDashboard jobs={jobs} onShowMessage={showMessage} onRefresh={() => loadJobs(true)} onExit={() => { setIsAdmin(false); setCurrentView('home'); }} onAddJob={() => setCurrentView('post')} />
        ) : currentView === 'submitting' ? (
          <div className="max-w-lg mx-auto mt-32 text-center">
            <div className="text-5xl mb-4 animate-pulse">⚡</div>
            <h2 className="text-2xl font-black uppercase tracking-tighter text-zinc-100 mb-2">Publishing your listing…</h2>
            <p className="text-zinc-400 font-mono text-sm">Payment confirmed. Hang tight.</p>
          </div>
        ) : currentView === 'posted' && postedJob ? (
          <div className="max-w-lg mx-auto mt-16 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-zinc-100 mb-2">Your listing is live!</h2>
            <p className="text-zinc-400 font-mono mb-6">Indexed in Google Jobs and searchable by biohazard cleanup pros nationwide.</p>
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-6 text-left">
              {postedJob.editCode ? (
                <>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Your edit code — save this</p>
                  <p className="font-mono text-amber-400 text-lg tracking-widest mb-2">{postedJob.editCode}</p>
                  <p className="text-xs text-zinc-500">{postedJob.emailed ? 'Also sent to your email.' : `Email not sent${postedJob.emailError ? `: ${postedJob.emailError}` : ' — save this code now'}. `}Use it to edit your listing anytime.</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Edit code</p>
                  <p className="text-xs text-zinc-400">Your edit code was sent to the email you provided. Use it to make changes to your listing.</p>
                </>
              )}
            </div>
            <a
              href={`/jobs/${postedJob.slug}`}
              className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wide px-8 py-3 rounded transition mb-3 w-full text-center"
            >
              View Your Listing
            </a>
            <button
              onClick={() => { setEditTarget(postedJob.slug); setEditPrefilledCode(postedJob.editCode || ''); setCurrentView('edit'); }}
              className="inline-block border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-100 font-bold uppercase tracking-wide px-8 py-3 rounded transition mb-4 w-full text-center text-sm"
            >
              Edit Your Listing
            </button>
            <button onClick={() => setCurrentView('home')} className="text-xs text-zinc-500 hover:text-zinc-300 uppercase tracking-widest block w-full">
              Back to Home
            </button>
          </div>
        ) : currentView === 'why-post-here' ? (
          <WhyPostHerePage onPostJob={() => { window.history.pushState({}, '', '/'); setCurrentView('post'); }} />
        ) : currentView === 'job-detail' ? (
          <JobDetailPage slug={jobDetailSlug} onBack={() => { window.history.pushState({}, '', '/'); setCurrentView('home'); }} />
        ) : currentView === 'post' ? (
          <JobForm onSave={handleAddJob} onDirectSave={handleAddJobDirect} onCancel={() => setCurrentView('home')} onShowMessage={showMessage} />
        ) : currentView === 'edit' ? (
          <EditPostGateway
            initialJobKey={editTarget}
            initialCode={editPrefilledCode}
            onShowMessage={showMessage}
            onSaved={async () => { await loadJobs(isAdmin); setCurrentView('home'); }}
            onCancel={() => { setEditPrefilledCode(''); setCurrentView('home'); }}
          />
        ) : (
          <>
            <section className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 lg:-mt-12 mb-8 bg-zinc-900 border-b border-zinc-800">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 relative overflow-hidden">
                <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/4 text-zinc-800/30 pointer-events-none" aria-hidden="true">
                  <ShieldAlert className="w-[400px] h-[400px]" />
                </div>
                <div className="relative z-10 max-w-3xl">
                  <span className="inline-block py-1 px-3 rounded-full bg-zinc-950 border border-zinc-800 text-amber-500 text-xs font-bold tracking-widest uppercase mb-4">The Elite Network</span>
                  <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-zinc-100 leading-[1.1] mb-6">
                    Restore Order. <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600">Find Your Next Mission.</span>
                  </h1>
                  <p className="text-lg text-zinc-400 max-w-xl leading-relaxed font-mono">
                    The premier dispatch board for biohazard remediation, trauma cleanup, and environmental hazard specialists. No fluff. Just the facts.
                  </p>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:hidden flex justify-between items-center mb-2">
                <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                  {isLoading ? 'Scanning...' : `${filteredJobs.length} Record${filteredJobs.length === 1 ? '' : 's'}`}
                </p>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  aria-expanded={showFilters}
                  className="flex items-center text-sm font-bold text-zinc-100 bg-zinc-800 px-4 py-2 rounded-md border border-zinc-700"
                >
                  <Filter className="w-4 h-4 mr-2 text-amber-500" aria-hidden="true" />
                  {showFilters ? 'Hide Filters' : 'Filters'}
                </button>
              </div>

              <aside className={`lg:col-span-1 ${showFilters ? 'block' : 'hidden lg:block'}`}>
                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 lg:sticky lg:top-24">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50">
                    <h2 className="font-bold tracking-wide uppercase text-zinc-100 flex items-center text-sm">
                      <Target className="w-4 h-4 mr-2 text-amber-500" aria-hidden="true" /> Filters
                    </h2>
                    <button onClick={resetFilters} className="text-[10px] text-zinc-500 font-bold hover:text-zinc-300 uppercase tracking-wider transition-colors bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="search-input" className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Keyword Search</label>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" aria-hidden="true" />
                        <input
                          id="search-input"
                          type="search"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search jobs..."
                          className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-zinc-200 placeholder-zinc-600"
                        />
                      </div>
                    </div>
                    {[
                      { label: 'Sort By', key: 'sort', opts: ['Newest', 'Oldest', 'High to Low', 'Low to High'] },
                      { label: 'State', key: 'state', opts: ['All', ...options.states] },
                      { label: 'City', key: 'city', opts: ['All', ...options.cities] },
                      { label: 'Pay Type', key: 'paytype', opts: ['All', ...options.paytypes] },
                      { label: 'Job Type', key: 'category', opts: ['All', ...options.categories] },
                      { label: 'Company', key: 'company', opts: ['All', ...options.companies] },
                    ].map(f => (
                      <div key={f.key}>
                        <label htmlFor={`filter-${f.key}`} className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">{f.label}</label>
                        <select
                          id={`filter-${f.key}`}
                          value={filters[f.key]}
                          onChange={(e) => handleFilterChange(f.key, e.target.value)}
                          className="w-full p-2 bg-zinc-950 border border-zinc-800 rounded text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-zinc-200 appearance-none"
                        >
                          {f.opts.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <section className="lg:col-span-3" aria-label="Job listings">
                <div className="hidden lg:flex mb-6 items-center justify-between">
                  <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                    {isLoading ? 'Syncing with database...' : `${filteredJobs.length} Active Record${filteredJobs.length === 1 ? '' : 's'}`}
                  </p>
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-20">
                    <Activity className="w-8 h-8 text-amber-500 animate-spin" aria-label="Loading jobs" />
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="bg-zinc-900 py-16 px-6 rounded-xl border border-zinc-800 text-center">
                    <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" aria-hidden="true" />
                    <h3 className="text-xl font-bold text-zinc-300 uppercase tracking-tight mb-2">No Records Found</h3>
                    <p className="text-zinc-500 mb-6 text-sm font-mono">Database is empty or parameters are too strict.</p>
                    <button onClick={resetFilters} className="text-amber-500 font-bold uppercase tracking-wide text-sm hover:text-amber-400 transition-colors">
                      Reset Scanners
                    </button>
                  </div>
                ) : (
                  filteredJobs.map(job => (
                    <JobCard key={job.id} job={job} onDeleteRequest={isAdmin ? requestDeleteJob : undefined} />
                  ))
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <p className="text-xs text-zinc-600 uppercase tracking-widest font-mono">&copy; {new Date().getFullYear()} CrimeSceneCleanerJobs</p>
          <button
            onClick={() => setCurrentView('login')}
            className="text-[10px] text-zinc-800 hover:text-zinc-500 uppercase tracking-widest transition-colors font-bold"
            aria-label="Admin gateway"
          >
            Admin Gateway
          </button>
        </div>
      </footer>
    </div>
  );
}
