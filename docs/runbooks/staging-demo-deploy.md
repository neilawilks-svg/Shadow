# Staging Demo Deploy Runbook (Single Secure URL)

This runbook is for a temporary client demo where one internal employee tests remotely before the client session.

## Goal
- Keep one stable staging URL for the demo.
- Require username/password for all app and API access.
- Deploy updates only when manually approved.

## One-Time Setup
1. Push this repository to GitHub.
2. In Vercel, import the GitHub repository as a new project.
3. In Vercel project settings, add environment variables for the `staging` environment:
   - `OPENAI_API_KEY` and existing model variables
   - `DEMO_USERNAME`
   - `DEMO_PASSWORD` (use a strong random password, 20+ characters)
4. In Vercel, configure Git:
   - Production branch: `main`
   - Create and use a separate `staging` branch for demo hosting.
5. Trigger first deploy from `staging`, then copy the staging URL.

## Branch Workflow (Manual Approval)
1. Create a feature branch for each requested change.
2. Open a pull request from feature branch into `staging`.
3. Review and approve the PR.
4. Merge the PR to `staging`.
5. Wait for Vercel staging deployment to complete.
6. Ask the internal demo owner to test on the same staging URL.

## Credential Sharing
1. Share staging URL and credentials only with the assigned demo employee.
2. Do not post credentials in public channels.

## Quick Validation After Deploy
1. Open staging URL in an incognito window.
2. Confirm browser prompts for username/password.
3. Confirm wrong password is rejected.
4. Confirm correct password opens app pages and API-powered features.

## Rotation and Shutdown After Demo
1. Rotate `DEMO_PASSWORD` in Vercel immediately after the demo.
2. If no further use, disable or remove the staging deployment.

## Troubleshooting
- If login prompt does not appear:
  - Check `DEMO_USERNAME` and `DEMO_PASSWORD` are set for the deployed environment.
  - Redeploy staging after env var changes.
- If static assets fail to load:
  - Confirm `middleware.ts` matcher excludes Next static paths.
