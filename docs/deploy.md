# Deploying a study (Vercel and Supabase)

blindpanel's server parts are web-standard `Request → Response` functions, so any platform with `fetch` works. This guide uses Vercel Functions and a Supabase Postgres.

## 1. The database

1. Create a Supabase project. In the SQL editor, run `sql/schema.sql`. It is safe to run again.
2. Settings → API → Exposed schemas: add `blindpanel`. Without this, every call returns 404.
3. Copy the project URL and a **secret** key (`sb_secret_…`). The key goes only into your server's environment, never into the page. The `supabaseStore` sends it in the `apikey` header only.

The schema forces row-level security on and defines no policies. `anon` and `authenticated` can do nothing, and the service role can only `select`, `insert` and run `tally()`: no updates or deletes. A trigger caps inserts at 500 a day and 20,000 in total (change them in `blindpanel.settings`).

## 2. The functions

```ts
// api/submit.ts
import { createSubmitHandler, supabaseStore } from "blindpanel/server";
import study from "../public/study.json" with { type: "json" };

const store = supabaseStore({ url: process.env.SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! });
export const POST = createSubmitHandler({ study, store, allowedOrigins: ["https://your.site"] });
```

`createTallyHandler({ study, store })` serves `GET /api/tally` with `s-maxage=300`. `createKeepwarmHandler({ store, secret: process.env.CRON_SECRET, study: study.id })`, run by a daily Vercel cron, stops a free Supabase project from pausing after a week of inactivity.

## 3. The page

Mount it in your app:

```ts
import { mountSession, mountResults } from "blindpanel/ui";
import "blindpanel/ui/style.css";
```

Alternatively, deploy the folder `blindpanel build` writes as static files. Theme it by setting the `--bp-*` custom properties on `.bp` (see `src/ui/style.css`).

## 4. Check it live

`blindpanel verify study.yaml --dist <build> --media` checks the files and every remote media URL. After deploying, submit one session by hand and confirm that `blindpanel report --store supabase` sees it (run it with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the environment, e.g. through your secret manager's `run` command).
