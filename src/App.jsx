import { useState, useMemo, useEffect, useCallback } from 'react';
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

  approveCandidate: async (id) => apiRequest(`/api/admin/candidates/${id}/approve`, { method: 'POST', admin: true }),

  rejectCandidate: async (id) => apiRequest(`/api/admin/candidates/${id}/reject`, { method: 'POST', admin: true }),

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
const JobCard = ({ job, onDeleteRequest, onShowMessage }) => {
  const [expanded, setExpanded] = useState(false);
  const maxLength = 220;
  const content = job.content || '';
  const isLong = content.length > maxLength;
  const displayContent = expanded ? content : content.substring(0, maxLength) + (isLong ? '...' : '');

  const handleApply = () => {
    const contact = job.contact || '';
    if (contact.includes('@')) {
      onShowMessage('Contact Protocol', `Send operations request to: ${contact}`, 'info');
    } else if (contact.startsWith('http')) {
      window.open(contact, '_blank', 'noopener,noreferrer');
    } else {
      onShowMessage('Dispatch Number', `Contact dispatch at: ${contact}`, 'info');
    }
  };

  return (
    <article className="group relative bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-5 transition-all duration-300 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true"></div>

      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-bold tracking-tight">
              <a href={job.detail_path || `/jobs/${job.slug}`} className="text-zinc-100 hover:text-amber-400 transition-colors">
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
              <Building className="w-4 h-4 mr-1.5 text-zinc-500" aria-hidden="true" /> {job.company}
            </span>
            <span className="flex items-center text-sm">
              <Navigation className="w-4 h-4 mr-1.5 text-zinc-500" aria-hidden="true" /> {job.city}, {job.state}
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

      <div className="text-zinc-400 whitespace-pre-wrap mb-4 text-sm leading-relaxed font-mono">
        {displayContent}
      </div>

      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-500 hover:text-amber-400 text-sm font-semibold flex items-center mb-5 transition-colors"
          aria-expanded={expanded}
        >
          {expanded
            ? <><ChevronUp className="w-4 h-4 mr-1" aria-hidden="true" /> Collapse report</>
            : <><ChevronDown className="w-4 h-4 mr-1" aria-hidden="true" /> Read full report</>}
        </button>
      )}

      <div className="flex justify-between items-center mt-5 pt-5 border-t border-zinc-800/50">
        <button
          onClick={handleApply}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold uppercase tracking-wide text-sm py-2.5 px-8 rounded-md transition-all active:scale-95"
        >
          Apply Now
        </button>
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
const JobForm = ({ onSave, onCancel, onShowMessage, initialJob = null, mode = 'create' }) => {
  const [formData, setFormData] = useState(() => formStateFromJob(initialJob || {}));
  const [aiText, setAiText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(mode === 'edit' ? 2 : 1);

  const handleAIParsing = async () => {
    setIsProcessing(true);
    try {
      const result = await dbService.parseJob(aiText);
      setFormData(prev => ({
        ...prev,
        ...result.job,
        owner_email: prev.owner_email,
        content: result.job.content || aiText,
      }));
      setStep(2);
    } catch (error) {
      onShowMessage('Parser Offline', `${error.message}. You can still finish the listing manually.`, 'info');
      setFormData(prev => ({ ...prev, content: aiText }));
      setStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentAndSave = async () => {
    if (mode !== 'edit' && !formData.owner_email) {
      onShowMessage('Owner Email Required', 'Add an owner email so the edit code has somewhere to go.', 'info');
      return;
    }
    setIsProcessing(true);
    await onSave({ ...formData, created: new Date().toISOString() });
    setIsProcessing(false);
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
          Paste your raw job description, notes, or requirements. Our system extracts the critical data and generates an SEO-optimized listing.
        </p>
        <div className="mb-5">
          <label className={labelClass}>Owner Email *</label>
          <input
            type="email"
            value={formData.owner_email}
            onChange={e => setFormData({ ...formData, owner_email: e.target.value })}
            className={inputClass}
          />
        </div>
        <textarea
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          placeholder="Paste operational requirements..."
          aria-label="Paste job description for AI parsing"
          className="w-full h-48 p-4 bg-zinc-950 border-2 border-dashed border-zinc-700 rounded-lg mb-6 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500 focus:bg-zinc-900 transition-colors resize-none font-mono text-sm"
        />
        <div className="flex flex-col items-center space-y-4">
          <button
            onClick={handleAIParsing}
            disabled={isProcessing || !aiText}
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

  if (step === 3) {
    return (
      <div className="max-w-md mx-auto bg-zinc-900 p-8 rounded-xl border border-zinc-800 text-center shadow-2xl mt-8">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-zinc-100 mb-2 uppercase tracking-tight">Post Job</h2>
        <p className="text-zinc-400 mb-6 text-sm font-mono">{mode === 'edit' ? 'Save updates for admin review. Published listings temporarily return to review after edits.' : 'Submit the listing for review. Approved jobs are published with Google Jobs structured data.'}</p>
        <div className="p-5 bg-zinc-950 rounded-lg mb-6 border border-zinc-800 text-left">
          <p className="font-bold text-zinc-100">{formData.title}</p>
          <p className="text-sm text-zinc-500 mt-1">{formData.company}</p>
        </div>
        <button
          onClick={handlePaymentAndSave}
          disabled={isProcessing}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-bold uppercase tracking-wide py-3.5 px-4 rounded-md transition-all active:scale-[0.98]"
        >
          {isProcessing ? 'Submitting...' : mode === 'edit' ? 'Save Updates' : 'Submit Listing'}
        </button>
        <button onClick={() => setStep(2)} className="mt-5 text-zinc-500 hover:text-zinc-300 text-sm font-medium">
          Abort & Return to Edit
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl mt-8">
      <h2 className="text-2xl font-bold mb-8 text-zinc-100 uppercase tracking-tight border-b border-zinc-800 pb-4">Job Details</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div><label className={labelClass}>Job Title *</label><input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className={inputClass} /></div>
        <div><label className={labelClass}>Company Name *</label><input type="text" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} className={inputClass} /></div>
      </div>
      {mode !== 'edit' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div><label className={labelClass}>Owner Email *</label><input type="email" value={formData.owner_email} onChange={e => setFormData({ ...formData, owner_email: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Company Website</label><input type="url" value={formData.company_url} onChange={e => setFormData({ ...formData, company_url: e.target.value })} className={inputClass} /></div>
        </div>
      ) : (
        <div className="mb-6">
          <label className={labelClass}>Company Website</label>
          <input type="url" value={formData.company_url} onChange={e => setFormData({ ...formData, company_url: e.target.value })} className={inputClass} />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div><label className={labelClass}>ZIP Code</label><input type="text" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} className={inputClass} /></div>
        <div><label className={labelClass}>City</label><input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} className={inputClass} /></div>
        <div>
          <label className={labelClass}>State</label>
          <select value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} className={inputClass}>
            <option>Select</option>
            {US_STATES.map(state => <option key={state} value={state}>{state}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div><label className={labelClass}>Min Pay</label><input type="number" value={formData.payrangemin} onChange={e => setFormData({ ...formData, payrangemin: e.target.value })} className={inputClass} /></div>
        <div><label className={labelClass}>Max Pay</label><input type="number" value={formData.payrangemax} onChange={e => setFormData({ ...formData, payrangemax: e.target.value })} className={inputClass} /></div>
        <div className="col-span-2">
          <label className={labelClass}>Pay Type</label>
          <select value={formData.paytype} onChange={e => setFormData({ ...formData, paytype: e.target.value })} className={inputClass}>
            <option>Pay Type Not Specified</option><option>Hourly</option><option>Salary</option><option>Contract</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className={labelClass}>Job Type</label>
          <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className={inputClass}>
            <option>Full-time</option><option>Part-time</option><option>Contract</option>
          </select>
        </div>
        <div><label className={labelClass}>Contact Link/Email *</label><input type="text" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} className={inputClass} /></div>
      </div>
      <div className="mb-8">
        <label className={labelClass}>Full Description / Report *</label>
        <textarea value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} className={`${inputClass} h-48 resize-y font-mono`} />
      </div>
      <div className="flex justify-end space-x-4 pt-6 border-t border-zinc-800">
        <button onClick={onCancel} className="px-6 py-2.5 rounded-md font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-100 transition-colors">Abort</button>
        <button onClick={() => setStep(3)} className="px-8 py-2.5 bg-amber-500 text-zinc-950 font-bold uppercase tracking-wide rounded-md hover:bg-amber-400 transition-colors active:scale-[0.98]">{mode === 'edit' ? 'Review Updates' : 'Review Submission'}</button>
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

const EditPostGateway = ({ initialJobKey = '', onCancel, onShowMessage, onSaved }) => {
  const [jobKey, setJobKey] = useState(initialJobKey);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifiedJob, setVerifiedJob] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const inputClass = 'w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors';
  const labelClass = 'block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2';

  const handleRequestCode = async () => {
    setIsProcessing(true);
    try {
      const result = await dbService.requestEditCode(extractJobKey(jobKey), email);
      if (result.edit_code) {
        setCode(result.edit_code);
        onShowMessage('Edit Code Generated', `Your edit code is ${result.edit_code}. It expires ${new Date(result.expires_at).toLocaleDateString()}.`, 'info');
      } else {
        onShowMessage('Check Email', 'If that email matches the listing owner, an edit code has been sent.', 'info');
      }
    } catch (error) {
      onShowMessage('Code Request Failed', error.message, 'info');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerify = async () => {
    setIsProcessing(true);
    try {
      const result = await dbService.verifyEditCode(extractJobKey(jobKey), code);
      setVerifiedJob(result.job);
    } catch (error) {
      onShowMessage('Access Denied', error.message, 'info');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async (jobData) => {
    setIsProcessing(true);
    try {
      await dbService.updateWithEditCode(extractJobKey(jobKey), code, jobData);
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
    <div className="max-w-xl mx-auto bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl mt-8">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-8 h-8 text-amber-500" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-zinc-100 uppercase tracking-tight">Edit a Post</h2>
      </div>
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Job Link or Slug</label>
          <input type="text" value={jobKey} onChange={e => setJobKey(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Owner Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
        </div>
        <button
          onClick={handleRequestCode}
          disabled={isProcessing || !jobKey || !email}
          className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-950 disabled:text-zinc-600 border border-zinc-700 text-zinc-100 font-bold uppercase tracking-wide py-3 rounded transition-colors"
        >
          Send Edit Code
        </button>
        <div className="border-t border-zinc-800 pt-5">
          <label className={labelClass}>Edit Code</label>
          <input type="text" value={code} onChange={e => setCode(e.target.value)} className={`${inputClass} uppercase tracking-widest`} />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-6 py-2.5 rounded-md font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-100 transition-colors">Cancel</button>
          <button
            onClick={handleVerify}
            disabled={isProcessing || !jobKey || !code}
            className="px-8 py-2.5 bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold uppercase tracking-wide rounded-md hover:bg-amber-400 transition-colors"
          >
            Unlock Post
          </button>
        </div>
      </div>
    </div>
  );
};

// --- ADMIN DASHBOARD ---
const AdminDashboard = ({ jobs, onExit, onShowMessage, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('aggregator');
  const [isScanning, setIsScanning] = useState(false);
  const [scrapedJobs, setScrapedJobs] = useState([]);
  const [scanQuery, setScanQuery] = useState('Crime Scene Cleanup');
  const [scanLocation, setScanLocation] = useState('Nationwide');
  const [autoPilot, setAutoPilot] = useState(false);
  const [agentLogs, setAgentLogs] = useState(['[SYSTEM] Autonomous Agent initialized. Standing by...']);

  useEffect(() => {
    let isMounted = true;
    const loadCandidates = async () => {
      try {
        const candidates = await dbService.listCandidates();
        if (isMounted) setScrapedJobs(candidates);
      } catch (error) {
        console.error('Candidate sync failed:', error);
      }
    };
    loadCandidates();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!autoPilot) return;
    let isMounted = true;
    const runAgent = async () => {
      setIsScanning(true);
      setAgentLogs(prev => [...prev, '[AGENT] Running Cloudflare import pipeline now...']);
      try {
        const result = await dbService.scanJobs(scanQuery, scanLocation);
        if (!isMounted) return;
        setScrapedJobs(result.candidates || []);
        setAgentLogs(prev => [
          ...prev,
          `[AGENT] Discovered ${result.discovered || 0} URLs; queued ${result.candidates?.length || 0} candidates.`,
          '[SYSTEM] Daily schedule lives in the Cloudflare Cron Worker.',
        ]);
      } catch (error) {
        if (!isMounted) return;
        setAgentLogs(prev => [...prev, `[ERROR] ${error.message}`]);
        onShowMessage('Agent Failed', error.message, 'info');
      } finally {
        if (isMounted) {
          setIsScanning(false);
          setAutoPilot(false);
        }
      }
    };
    runAgent();
    return () => { isMounted = false; };
  }, [autoPilot, onShowMessage, scanLocation, scanQuery]);

  const runSourceScan = async () => {
    setIsScanning(true);
    setAgentLogs(prev => [...prev, `[SCAN] ${scanQuery} / ${scanLocation}`]);
    try {
      const result = await dbService.scanJobs(scanQuery, scanLocation);
      setScrapedJobs(result.candidates || []);
      setAgentLogs(prev => [...prev, `[SCAN] ${result.discovered || 0} sources checked. ${result.candidates?.length || 0} candidates queued.`]);
      onShowMessage('Scan Complete', `${result.candidates?.length || 0} candidate listings are ready for review.`, 'info');
    } catch (error) {
      setAgentLogs(prev => [...prev, `[ERROR] ${error.message}`]);
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
      </div>

      <div className="p-8 min-h-[500px]">
        {activeTab === 'aggregator' ? (
          <div className="space-y-8">
            <div className="bg-zinc-950 border border-amber-500/30 p-6 rounded-lg relative overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.05)]">
              <div className="absolute top-0 right-0 p-6">
                <button
                  onClick={() => {
                    if (!autoPilot) setAgentLogs(['[SYSTEM] Manual override engaged. Booting agent...']);
                    setAutoPilot(!autoPilot);
                  }}
                  aria-label={autoPilot ? 'Disable autonomous agent' : 'Enable autonomous agent'}
                  aria-pressed={autoPilot}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${autoPilot ? 'bg-amber-500' : 'bg-zinc-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-zinc-100 transition-transform ${autoPilot ? 'translate-x-6' : 'translate-x-1'}`} aria-hidden="true" />
                </button>
              </div>
              <h3 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center">
                <Cpu className="w-4 h-4 mr-2" aria-hidden="true" /> Autonomous AI Agent
              </h3>
              <p className="text-xs text-zinc-400 mb-4 max-w-xl leading-relaxed font-mono">
                The deployed Cloudflare Cron Worker wakes daily, checks configured job APIs/search sources, extracts details, and queues real listings for approval.
              </p>
              <div
                className="bg-zinc-900 border border-zinc-800 rounded p-4 font-mono text-xs text-green-400 h-40 overflow-y-auto flex flex-col justify-end shadow-inner"
                aria-live="polite"
                aria-label="Agent log output"
              >
                {agentLogs.map((log, i) => <div key={i} className="mb-1.5 opacity-90">{log}</div>)}
                {autoPilot && <div className="animate-pulse mt-1 text-amber-500" aria-hidden="true">_</div>}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-widest mb-4 flex items-center">
                <Terminal className="w-4 h-4 mr-2 text-zinc-500" aria-hidden="true" /> Manual Web Scraper
              </h3>
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Target Keywords</label>
                  <input type="text" value={scanQuery} onChange={e => setScanQuery(e.target.value)} className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-100 focus:border-amber-500 font-mono text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Target Location</label>
                  <input type="text" value={scanLocation} onChange={e => setScanLocation(e.target.value)} className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-100 focus:border-amber-500 font-mono text-sm" />
                </div>
              </div>
              <button
                onClick={runSourceScan}
                disabled={isScanning}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-500 font-bold uppercase tracking-wide py-3 px-6 rounded-md flex items-center"
              >
                {isScanning
                  ? <><Activity className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" /> Scanning Web...</>
                  : <><Radar className="w-5 h-5 mr-2" aria-hidden="true" /> Initialize Scan</>}
              </button>
            </div>

            {scrapedJobs.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2">
                  Pending Import Operations ({scrapedJobs.length})
                </h3>
                <div className="space-y-4">
                  {scrapedJobs.map(job => (
                    <div key={job.id} className="bg-zinc-950 border border-zinc-800 p-5 rounded-lg flex justify-between items-center group hover:border-amber-500/30 transition-colors">
                      <div>
                        <h4 className="text-lg font-bold text-zinc-100">{job.title}</h4>
                        <p className="text-sm text-zinc-400">{job.company || 'Company unknown'} • {[job.city, job.state].filter(Boolean).join(', ') || 'Location unknown'}</p>
                        <p className="text-xs text-zinc-600 font-mono mt-1">
                          {Math.round(Number(job.confidence || 0) * 100)}% confidence
                          {job.source_url && (
                            <>
                              {' '}• <a href={job.source_url} target="_blank" rel="noreferrer" className="text-amber-500 hover:text-amber-400">source</a>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => rejectJob(job.id)}
                          aria-label={`Reject ${job.title}`}
                          className="p-2 bg-zinc-900 hover:bg-red-500/20 text-zinc-500 hover:text-red-500 rounded border border-zinc-800"
                        >
                          <X className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => approveJob(job)}
                          aria-label={`Approve and import ${job.title}`}
                          className="p-2 bg-zinc-900 hover:bg-green-500/20 text-zinc-500 hover:text-green-500 rounded border border-zinc-800"
                        >
                          <Download className="w-5 h-5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2" role="tabpanel">
            {jobs.length === 0 && (
              <p className="text-zinc-500 text-sm font-mono text-center py-12">No records in database.</p>
            )}
            {jobs.map(job => (
              <div key={job.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-zinc-100">{job.title}</h4>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm ${job.status === 'active' ? 'bg-green-500/15 text-green-400' : job.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {job.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">{job.company} • {[job.city, job.state].filter(Boolean).join(', ') || 'No location'}</p>
                </div>
                <div className="flex items-center gap-3">
                  {job.status !== 'active' && (
                    <button
                      onClick={() => updateLiveJobStatus(job, 'active')}
                      className="text-[10px] font-bold uppercase tracking-widest text-green-400 hover:text-green-300"
                    >
                      Publish
                    </button>
                  )}
                  {job.status === 'active' && (
                    <button
                      onClick={() => updateLiveJobStatus(job, 'expired')}
                      className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
                    >
                      Expire
                    </button>
                  )}
                  {job.status === 'pending' && (
                    <button
                      onClick={() => updateLiveJobStatus(job, 'rejected')}
                      className="text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300"
                    >
                      Reject
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await dbService.deleteJob(job.id);
                        await onRefresh?.();
                      } catch (error) {
                        onShowMessage('Delete Failed', error.message, 'info');
                      }
                    }}
                    aria-label={`Delete ${job.title}`}
                    className="text-zinc-600 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState(() => {
    if (urlParams.get('edit')) return 'edit';
    if (window.location.pathname === '/post-success') return 'post';
    return 'home';
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [editTarget, setEditTarget] = useState(() => urlParams.get('edit') || '');
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

  const authorizeAdmin = () => {
    const token = window.prompt('Enter your admin token', adminToken || '');
    if (!token) return;
    localStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
    setAdminToken(token.trim());
    setIsAdmin(true);
    setCurrentView('admin');
  };

  const handleAddJob = async (newJob) => {
    try {
      const result = await dbService.addJob(newJob, { publish: isAdmin });
      const saved = result.job;
      if (saved.status === 'active' && saved.slug) {
        setPostedJob({ slug: saved.slug, editCode: result.edit?.edit_code || '' });
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
<button
                onClick={() => setCurrentView('payment')}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 px-4 sm:px-5 py-2 rounded font-bold text-sm uppercase tracking-wide transition flex items-center"
              >
                <PlusCircle className="w-4 h-4 sm:mr-2 text-amber-500" aria-hidden="true" /> <span className="hidden sm:inline">Post a Job</span>
              </button>
            </div>
          </div>
        </nav>
      </header>

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {currentView === 'login' ? (
          <div className="max-w-md mx-auto mt-20 bg-zinc-900 p-8 border border-zinc-800 rounded-xl shadow-2xl text-center">
            <ShieldAlert className="w-12 h-12 text-zinc-500 mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-xl font-bold uppercase tracking-widest text-zinc-100 mb-6">Restricted Area</h2>
            <button
              onClick={authorizeAdmin}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold uppercase tracking-wide py-3 rounded border border-zinc-700 transition-colors"
            >
              Authorize Access
            </button>
            <button onClick={() => setCurrentView('home')} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300 uppercase tracking-widest">
              Return to Public Grid
            </button>
          </div>
        ) : currentView === 'admin' && isAdmin ? (
          <AdminDashboard jobs={jobs} onShowMessage={showMessage} onRefresh={() => loadJobs(true)} onExit={() => { setIsAdmin(false); setCurrentView('home'); }} />
        ) : currentView === 'posted' && postedJob ? (
          <div className="max-w-lg mx-auto mt-16 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-zinc-100 mb-2">Your listing is live!</h2>
            <p className="text-zinc-400 font-mono mb-8">It's indexed in Google Jobs and searchable on the site.</p>
            {postedJob.editCode && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-6 text-left">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Your edit code — save this</p>
                <p className="font-mono text-amber-400 text-lg tracking-widest">{postedJob.editCode}</p>
                <p className="text-xs text-zinc-500 mt-2">Also sent to your email. Use it to edit your listing anytime.</p>
              </div>
            )}
            <a
              href={`/jobs/${postedJob.slug}`}
              className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wide px-8 py-3 rounded transition mb-4 w-full text-center"
            >
              View Your Listing
            </a>
            <button onClick={() => setCurrentView('home')} className="text-xs text-zinc-500 hover:text-zinc-300 uppercase tracking-widest block w-full">
              Back to Home
            </button>
          </div>
        ) : currentView === 'payment' ? (
          <div className="max-w-lg mx-auto mt-12 text-center">
            <PlusCircle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
            <h2 className="text-3xl font-black uppercase tracking-tighter text-zinc-100 mb-2">Post a Job</h2>
            <p className="text-zinc-400 font-mono mb-2">$99 flat. No subscription.</p>
            <ul className="text-sm text-zinc-400 mb-8 space-y-1">
              <li>45-day listing</li>
              <li>Dedicated SEO-optimized page</li>
              <li>Indexed in Google Jobs</li>
              <li>Edit link sent to your email</li>
            </ul>
            <a
              href="https://buy.stripe.com/6oU14mbCsbzo2sOb7G24000"
              className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wide px-10 py-4 rounded text-lg transition w-full text-center mb-6"
            >
              Pay $99 — Post Your Job
            </a>
            <button onClick={() => setCurrentView('home')} className="text-xs text-zinc-500 hover:text-zinc-300 uppercase tracking-widest">
              Cancel
            </button>
          </div>
        ) : currentView === 'post' ? (
          <JobForm onSave={handleAddJob} onCancel={() => setCurrentView('home')} onShowMessage={showMessage} />
        ) : currentView === 'edit' ? (
          <EditPostGateway
            initialJobKey={editTarget}
            onShowMessage={showMessage}
            onSaved={async () => { await loadJobs(isAdmin); setCurrentView('home'); }}
            onCancel={() => setCurrentView('home')}
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
                    <JobCard key={job.id} job={job} onDeleteRequest={isAdmin ? requestDeleteJob : undefined} onShowMessage={showMessage} />
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
