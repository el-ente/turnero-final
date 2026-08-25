# Firebase Multi-Environment Setup — Work Summary

## Audit (Phase 1-2)

Single Firebase project (`turnero-60150`), no env separation, CI deploying straight to it via a JSON service-account key. Found:
- Expired `firestore.rules` (denied all access since 2026-04-23)
- Missing Auth emulator config
- No `.gitignore` entries for local tooling

## Built out

- 3 new Firebase projects (`turnero-1212-dev/qa/prod`, Blaze), `.firebaserc` aliases, web apps registered
- CI split by branch: `develop`→dev, `qa`→qa, `main`→prod, via `deploy.yml` + `preview.yml`
- Keyless auth: Workload Identity Federation replacing the JSON key, per-env deployer service accounts with scoped IAM roles
- GitHub Environments (`dev`/`qa`/`prod`), `prod` gated by required-reviewer approval + restricted to `main`
- Fixed: `firestore.rules` stopgap, emulator config, `functions/` lint (577→0 errors), Google Sign-In auth config

## The long tail

Each of these only surfaced once the previous one was fixed — none of this had ever actually worked, including on the original project:

1. `firebase-tools` doesn't support WIF's `external_account` creds — fixed via explicit `--token`
2. New projects missing several GCP APIs (`iamcredentials`, `cloudfunctions`, `run`, etc.) — enabled
3. No default GCP resource location — `gcloud app create`
4. No Storage bucket provisioned — created via Firebase Storage Management API
5. Cloud Build's isolated `npm install` can't resolve pnpm's `workspace:*` — vendored `shared` package, swapped to `file:` dependency around deploy only
6. `firebase-tools`' predeploy runner silently no-ops commands containing `=` — moved logic into a real script file
7. Missing `@firebase/app` (an optional peer dep that's actually required at runtime) — added explicitly, verified with a local Cloud-Build-equivalent install
8. Missing `--force` for Artifact Registry cleanup policy

## Result

`develop` and `qa` deployed clean (all 21 functions live, storage/firestore/hosting/auth released). `main`→prod was approved and deployed.
