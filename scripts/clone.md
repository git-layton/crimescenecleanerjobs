# Cloning a New Site

## Checklist per clone

Tell Claude: niche, domain, brand color hex, hero headline, Stripe URL.
Claude handles steps 1–4. You handle step 5 (DNS).

---

### 1. Create D1 database
```bash
npx wrangler d1 create SITENAME
```
Copy the `database_id` from output.

### 2. Create `wrangler.SITENAME.toml`
Copy `wrangler.toml`, update:
- `name = "SITENAME"`
- `PUBLIC_SITE_URL = "https://DOMAIN"`
- `FROM_EMAIL = "SiteName <no-reply@DOMAIN>"`
- `JOB_SCAN_QUERIES = "query1;query2;query3;query4;query5;query6"`
- `SITE_NAME`, `SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_TAGLINE`
- `SITE_HERO_HEADLINE`, `SITE_HERO_SUBHEADING`, `SITE_BRAND_LABEL`
- `NICHE_DESCRIPTION`, `NICHE_EXAMPLE_QUERY`
- `STRIPE_CHECKOUT_URL`
- `database_id` (from step 1)

### 3. Run migrations + deploy
```bash
npx wrangler d1 migrations apply SITENAME --config wrangler.SITENAME.toml --remote
npx wrangler deploy --config wrangler.SITENAME.toml
bash scripts/set-secrets.sh wrangler.SITENAME.toml
```

### 4. Create GitHub repo + rebrand
```bash
gh repo create git-layton/SITENAME --private
```

In the new repo, update these files:

| File | What to change |
|------|---------------|
| `wrangler.toml` | All clone config vars (copy from wrangler.SITENAME.toml) |
| `.env.production` | All `VITE_*` vars matching the wrangler vars |
| `src/index.css` | `@theme` block — remap amber + zinc to brand colors |
| `public/favicon.svg` | New icon matching the niche |
| `index.html` | Title, meta description, OG tags, canonical URL, fonts, JSON-LD schema |
| `public/robots.txt` | Sitemap URL → `https://DOMAIN/sitemap.xml` |
| `public/llms.txt` | Site name, description, who posts, who applies |
| `public/.well-known/security.txt` | Canonical URL → `https://DOMAIN/...` |

### 5. Connect Cloudflare → GitHub
Cloudflare dashboard → Workers & Pages → SITENAME worker → Settings → Build → Connect to Git
- Repo: `git-layton/SITENAME`
- Build command: `npm run build && npx wrangler deploy`

### 6. Point DNS
Cloudflare dashboard → Workers & Pages → SITENAME → Settings → Domains → Add `DOMAIN`
(Domain must be on Cloudflare DNS)

---

## Brand color reference

| Site | Accent | Surface |
|------|--------|---------|
| CrimeSceneCleanerJobs | amber (default) | zinc (default) |
| ApplianceInstallJobs | sky blue `#0ea5e9` | slate |

For new sites: pick an accent color, map it to Tailwind v4 oklch values in `src/index.css @theme`.
Remap `--color-amber-*` to your brand color, `--color-zinc-*` to a matching surface tone.
