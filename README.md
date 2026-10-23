# Orbital Breach

Orbital Breach is a React and TypeScript web app for a two-person campus QR mission. It includes a participant registration and login flow, a camera based scanner, a masked participant dashboard, and an administrator console. Supabase Auth, Postgres, RLS, and security definer RPCs own registration, claims, scoring, and admin actions.

## Local preview

```sh
npm install
npm run dev
```

Without Supabase credentials, the app opens in a designed preview mode. Real registration, login, scanner claims, and admin tools require a Supabase project.

## Supabase setup

1. Create a Supabase project, add the deployed HTTPS origin to Auth's allowed redirect URLs, and configure email confirmations with a working SMTP provider. The primary operator email must be confirmed before the team profile can be completed. Both operators can sign in with either registered email and the shared crew password.
2. Apply `supabase/migrations/0001_orbital_breach.sql` using the Supabase SQL editor or `supabase db push` after linking the project. Then apply `supabase/migrations/0002_scan_claim_feedback.sql`; it adds clear claim messages and seeds the eight supplied field locations as one-point stations.
3. Deploy the bootstrap function and set a long, random one time setup code:

   ```sh
   supabase functions deploy bootstrap-admin --no-verify-jwt
   supabase functions deploy team-login --no-verify-jwt
   supabase secrets set ADMIN_SETUP_CODE=<long-random-secret>
   ```

4. Copy `.env.example` to `.env.local` and set the project URL and anon key. Never put the service role key in a `VITE_` variable or browser code.
5. Start the app, open `/admin/bootstrap`, and create the first administrator with the setup code. Then remove `ADMIN_SETUP_CODE` and undeploy `bootstrap-admin`. The database function permits only the first administrator, even if multiple setup requests race.
6. Deploy the web app to a public HTTPS domain before producing physical QR codes. The second migration seeds these locations: Round 1 Fake QR — Mess Ground, Sports Complex, PJ Ground — Actual QR, Star Chart — Mech Parking, and Stations 1–4. Each awards one point once per team. Sign in as administrator and use **COPY QR LINK** beside each station to get its URL, then create the QR image from that URL. Never print a localhost URL.

The included Vercel and Netlify rewrite files route `/scan/<slug>` and `/admin/bootstrap` to the React app on direct visits.

For a college email allowlist, set `event_settings.allowed_email_domains` to the lower-case domain array in the SQL editor, for example `array['example.edu','example.ac.in']`. An empty array allows any syntactically valid email domain. The primary email is verified by Supabase Auth; the second address is uniquely reserved but not independently verified by this app.

## Security model

- Participants sign up through Supabase Auth. Profile completion runs through `complete_team_registration()`, which binds the crew to the authenticated, verified primary email. Neither the browser nor an unauthenticated endpoint can choose another user's ID.
- Registration has unique constraints for normalized team names and both participant email addresses. The secondary operator can authenticate through a server-only email alias lookup, but the endpoint returns only a session after password verification; it never returns the primary email or whether an address belongs to a crew.
- Teams can read only their own team profile. Participant roles cannot read scanner configuration, claims, interaction details, audit records, or the score ledger. Participant activity returns generic labels, and the UI never requests the score.
- `resolve_scan()` derives the team from the Auth session. A unique `(team_id, scanner_id)` claim key and `INSERT ... ON CONFLICT` make concurrent scans single-use. The claim, interaction, and score entry commit in one transaction.
- The claim page displays `1 POINT CLAIMED` (or `ALREADY CLAIMED`) and waits for the participant to choose **RETURN TO ORBITAL BREACH**. It does not reveal their score. Admins can view the team, station, result, point delta, and server-recorded scan time in **Recent Field Scans**.
- Reward signals add points, penalty signals subtract points, and clues, decoys, and neutral signals have a zero score delta. Repeatable scoring is deliberately unsupported so a reward cannot be farmed.
- Admin RPCs check the signed-in Auth user against `admins`, record score/status/configuration actions in `audit_logs`, and are protected by RLS. The service role exists only in Supabase Edge Function secrets.
- External scanner destinations must use HTTPS; internal destinations must begin with one `/`, preventing protocol-relative redirects. Treat external destinations as organizer-controlled content.

## Admin bootstrap lifecycle

`bootstrap-admin` is a one time setup surface protected by `ADMIN_SETUP_CODE` and a database-side lock. After the first admin exists, the SQL RPC refuses additional promotions. Remove the secret and undeploy the function right after setup. If the code was exposed, rotate it before continuing.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The unit tests cover score direction and neutral signal behavior. Database concurrency, RLS isolation, email confirmation, camera permissions, and actual QR claims still need to be exercised in a configured Supabase project and a browser with a camera. Camera scanning requires HTTPS (or localhost).

## Deployment limits

This workspace contains the application, migration, and Edge Functions. It does not contain Supabase project credentials, a deployed database, SMTP settings, or a hosting domain. A college email allowlist is optional and must be configured for your institution. Email confirmation delivery depends on the Supabase Auth SMTP setup. Configure provider-side sign-in limits and backups before opening registration publicly.

