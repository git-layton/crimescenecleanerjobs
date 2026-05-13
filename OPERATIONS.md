# Operations checklist

## Launch order

1. Create the Cloudflare D1 database.
2. Paste the returned `database_id` into `wrangler.toml` and `wrangler.agent.toml`.
3. Apply `migrations/0001_initial.sql`.
4. Set `ADMIN_TOKEN` and `PUBLIC_SITE_URL` in Cloudflare Pages.
5. Set `EDIT_CODE_PEPPER`.
6. Add `RESEND_API_KEY` and `FROM_EMAIL` if edit codes should be emailed instead of displayed once.
7. Deploy Pages.
8. Deploy the scheduled Worker with `wrangler.agent.toml`.
9. Add provider keys for OpenAI, Google Programmable Search, Adzuna, and Google Indexing as they become available.

The easiest way to set the minimum Worker secrets from Terminal is:

```sh
npm run secrets:minimum
```

When it asks for `ADMIN_TOKEN`, enter the admin password you want to remember.

## First data pass

Keep imported jobs as candidates until sources are proven:

```txt
AUTO_PUBLISH_JOBS=false
FETCH_SOURCE_PAGES=false
GOOGLE_INDEXING_ENABLED=false
```

Use the admin gateway, enter `ADMIN_TOKEN`, run a source scan, review candidates, then publish only listings that point to real apply pages or verified employer contact routes.

## Edit codes

Public submissions generate a private edit code tied to the listing owner email. Codes are stored only as hashes in D1. If `RESEND_API_KEY` is set, the code is emailed through Resend. If email is not configured, the app returns the code once after submission so launch testing is not blocked.

When a published listing is edited by code, it is moved back to `pending` for review before being shown to Google again.

## Google Jobs requirements

Active listings are exposed in three places:

- `/jobs/{slug}`: server-rendered HTML with `JobPosting` JSON-LD.
- `/sitemap.xml`: active job URLs.
- `/api/google/jobs.json`: debug feed of generated `JobPosting` objects.

For Google Indexing API, the service account must be added to the matching Search Console property. Turn on `GOOGLE_INDEXING_ENABLED=true` only after that ownership is configured.

## Local seed data

The seed file is for development only:

```sh
npx wrangler d1 execute crimescenecleanerjobs --local --file=seeds/local.sql
```

Do not apply `seeds/local.sql` to production.
