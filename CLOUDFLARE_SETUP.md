# Cloudflare setup

This app now uses Cloudflare Pages Functions, D1, and a scheduled Worker.

## 1. Create the D1 database

```sh
npx wrangler d1 create crimescenecleanerjobs
```

Copy the returned `database_id` into both `wrangler.toml` and `wrangler.agent.toml`, then run:

```sh
npx wrangler d1 migrations apply crimescenecleanerjobs --remote
```

## 2. Set Pages environment variables

Set these in Cloudflare Pages settings:

```txt
PUBLIC_SITE_URL=https://crimescenecleanerjobs.com
ADMIN_TOKEN=use-a-long-random-secret
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CX=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
FETCH_SOURCE_PAGES=false
EDIT_CODE_DAYS=30
EDIT_CODE_PEPPER=use-a-long-random-secret
RESEND_API_KEY=
FROM_EMAIL=CrimeSceneCleanerJobs <no-reply@crimescenecleanerjobs.com>
GOOGLE_INDEXING_ENABLED=false
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

Keep `AUTO_PUBLISH_JOBS=false` until you trust the imports. The daily agent will collect candidates for approval instead of publishing blindly.
Keep `FETCH_SOURCE_PAGES=false` unless you have confirmed the source pages allow automated fetching.
Set `RESEND_API_KEY` and `FROM_EMAIL` to email edit codes. Without Resend, the app displays the edit code one time after submission.

## 3. Deploy

```sh
npm run build
npx wrangler pages deploy dist --project-name crimescenecleanerjobs
npx wrangler deploy --config wrangler.agent.toml
```

## 4. Google Jobs and indexing

Every active job gets a crawlable page at `/jobs/{slug}` with `JobPosting` JSON-LD. `/sitemap.xml` includes active jobs, and `/api/google/jobs.json` exposes the same structured data for debugging.

For the Google Indexing API, enable the API in Google Cloud, create a service account, add that service account as an owner or full user for the Search Console property, then set `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_INDEXING_ENABLED=true`.

## 5. Local seed data

For local D1 testing only:

```sh
npm run db:seed:local
```

Those seed rows are intentionally labeled as development data and should not be pushed to production.
