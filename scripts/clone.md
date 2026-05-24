# Cloning a New Site

## Checklist per clone

Tell Claude: niche, domain, brand color hex, hero headline, Stripe URL.
Claude handles steps 1–5. You handle step 6 (DNS) and step 7 (Search Console).

---

### 1. Create D1 database
```bash
npx wrangler d1 create SITENAME
```
Copy the `database_id` from output.

### 2. Create the new repo
```bash
gh repo create git-layton/SITENAME --private
# Clone it, copy all files from crimescenecleanerjobs into it
```

### 3. Set up `wrangler.toml` in the new repo
Copy `wrangler.toml`, update ALL of these:
- `name = "SITENAME"`
- `PUBLIC_SITE_URL = "https://DOMAIN"` — **must not be blank**
- `FROM_EMAIL = "SiteName <no-reply@DOMAIN>"`
- `JOB_SCAN_QUERIES = "query1;query2;query3;query4;query5;query6"`
- `SITE_NAME`, `SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_TAGLINE`
- `SITE_HERO_HEADLINE`, `SITE_HERO_SUBHEADING`, `SITE_BRAND_LABEL`
- `NICHE_DESCRIPTION`, `NICHE_EXAMPLE_QUERY`
- `STRIPE_CHECKOUT_URL`
- `database_id` (from step 1)
- Add `routes` at the **top of the file, before `[vars]`**:
  ```toml
  routes = [
    { pattern = "DOMAIN/*", zone_name = "DOMAIN" }
  ]
  ```
  ⚠️ If `routes` is placed inside `[vars]` it becomes an env var — it must be before the first `[section]` header.

### 4. Rebrand frontend files
| File | What to change |
|------|---------------|
| `.env.production` | All `VITE_*` vars matching the wrangler vars |
| `src/index.css` | `@theme` block — remap amber + zinc to brand colors |
| `public/favicon.svg` | New icon matching the niche |
| `index.html` | Title, meta description, OG tags, canonical URL, fonts, JSON-LD schema |
| `public/robots.txt` | Sitemap URL → `https://DOMAIN/sitemap.xml` |
| `public/llms.txt` | Site name, description, who posts, who applies |
| `public/.well-known/security.txt` | Canonical URL → `https://DOMAIN/...` |

### 5. Copy `.dev.vars`, run migrations, set secrets, deploy
```bash
# Copy secrets file from crimescenecleanerjobs — same API keys work for all clones
cp /Users/alexlayton/Projects/crimescenecleanerjobs/.dev.vars .dev.vars

# Apply DB migrations
npx wrangler d1 migrations apply SITENAME --remote

# Set all secrets from .dev.vars onto the worker
bash scripts/set-secrets.sh wrangler.toml

# Build and deploy — always from the clone's own repo directory
npm run build && npx wrangler deploy
```

**Critical deployment rule:** Always `cd` into the clone's own repo and run `npx wrangler deploy` there (no `--config` flag). Running from another repo uploads the wrong `dist/` folder and serves the wrong branding.

Verify at `https://SITENAME.layton925.workers.dev/api/health`:
- `ok: true`
- `db_bound: true`
- `brave_search_configured: true` ← if this is false, the scanner finds 0 results

### 6. Point DNS
Domain must be on Cloudflare nameservers. Then either:
- Cloudflare dashboard → Workers & Pages → SITENAME → Settings → Domains → Add `DOMAIN`
- Or it's automatic if `routes` is set correctly in `wrangler.toml` (step 3)

Verify: `curl https://DOMAIN/api/health` should return `site_url: "https://DOMAIN"`.

### 7. Google Search Console
1. Add property → **Domain** type → `DOMAIN`
2. Verify with DNS TXT record — Cloudflare dashboard → DNS → add TXT record, Name `@`, Content = the verification string GSC gives you
3. Left sidebar → **Sitemaps** → submit `https://DOMAIN/sitemap.xml`

The sitemap lives at `/sitemap.xml` (returns `application/xml`). Do NOT submit `/_/api/sitemap.xml` — that returns HTML.

### 8. Connect GitHub → Cloudflare (auto-deploy)
Cloudflare dashboard → Workers & Pages → SITENAME worker → Settings → Build → Connect to Git
- Repo: `git-layton/SITENAME`
- Build command: `npm run build && npx wrangler deploy`

---

## Syncing shared code changes to clones

After any change to `src/App.jsx`, `functions/`, or `workers/` in crimescenecleanerjobs:

```bash
# 1. Build + deploy + push crimescenecleanerjobs first
npm run build && npx wrangler deploy
git add src/App.jsx && git commit -m "..." && git push

# 2. Copy changed files to each clone, then build + deploy + push from that clone's dir
cp src/App.jsx /path/to/clone/src/App.jsx
cd /path/to/clone
npm run build && npx wrangler deploy
git add src/App.jsx && git commit -m "..." && git push
```

---

## Brand color reference

| Site | Accent | Surface |
|------|--------|---------|
| CrimeSceneCleanerJobs | amber (default) | zinc (default) |
| ApplianceInstallJobs | sky blue `#0ea5e9` | slate |

For new sites: pick an accent color, map it to Tailwind v4 oklch values in `src/index.css @theme`.
Remap `--color-amber-*` to your brand color, `--color-zinc-*` to a matching surface tone.

---

## Known gotchas

- **`BRAVE_SEARCH_API_KEY` missing** → scanner finds 0 results. Always copy `.dev.vars` from crimescenecleanerjobs and run `set-secrets.sh`.
- **`routes` in wrong TOML position** → wrangler treats it as an env var, custom domain never connects. Must be before `[vars]`.
- **`PUBLIC_SITE_URL` blank** → worker doesn't know its own domain; sitemap URLs, emails, and JSON-LD will be wrong.
- **Deploying with `--config` from another repo** → uploads the wrong `dist/`, serves wrong branding. Always deploy from the clone's own directory.
- **Google Search Console wrong sitemap path** → `/_/api/sitemap.xml` returns the SPA HTML (catch-all route). Correct path is `/sitemap.xml`.
