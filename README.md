# CrimeSceneCleanerJobs

A niche job board for biohazard remediation, trauma cleanup, and hazmat cleanup roles.

## What is wired in

- React/Vite frontend.
- Cloudflare Pages Functions API.
- Cloudflare D1 database schema in `migrations/`.
- Crawlable job pages at `/jobs/{slug}` with `JobPosting` JSON-LD.
- Dynamic `/sitemap.xml`.
- Admin-token protected approval, rejection, expiration, deletion, source scan, and indexing routes.
- Owner edit codes for submitted posts, with optional Resend email delivery.
- Scheduled Cloudflare Worker for daily candidate discovery.

## Local start

Use Node 20+ with npm, install dependencies, create a local D1 database, then run:

```sh
npm install
npm run db:migrate:local
npm run db:seed:local
npm run pages:dev
```

Copy `.dev.vars.example` to `.dev.vars` for local Pages Functions variables.

## Deploy

Follow `CLOUDFLARE_SETUP.md`, then use:

```sh
npm run deploy
npm run agent:deploy
```

Keep `AUTO_PUBLISH_JOBS=false` until imported listings are consistently clean and verified.

## Minimum Cloudflare Secrets

After `wrangler login`, run:

```sh
npm run secrets:minimum
```

When prompted for `ADMIN_TOKEN`, enter the password you want to use in the Admin Gateway.

Optional automation/email provider keys can be added later:

```sh
npm run secrets:automation
```
