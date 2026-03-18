---
name: openclaw-render-ops
description: Use when working on the ai-hot OpenClaw content-generation repo in Codex App, especially for local running, smoke testing, Telegram/lead-capture verification, and Render-style deployment prep for ai-hot-comments-render-oneclick-v2.
---

# OpenClaw Render Ops

Use this skill when the task is about the `ai-hot` repo's deployable service in `ai-hot-comments-render-oneclick-v2`.

## What this skill covers
- Running the app locally
- Checking env requirements
- Smoke-testing the health/content/consultation endpoints
- Verifying Telegram webhook endpoint wiring
- Preparing Render-compatible deployment settings

## Repo locations
- App directory: `ai-hot-comments-render-oneclick-v2`
- Main server: `ai-hot-comments-render-oneclick-v2/src/server.js`
- App env template: `ai-hot-comments-render-oneclick-v2/.env.example`
- Root Render blueprint: `render.yaml`

## Standard workflow
1. `cd /workspace/ai-hot/ai-hot-comments-render-oneclick-v2`
2. Ensure dependencies are installed: `npm ci`
3. Copy env template if needed: `cp .env.example .env`
4. Fill env values relevant to the task
5. Run a smoke test with `scripts/smoke-test.sh`

## Important operating notes
- The app stores consultations/generations in local JSON under `data/`; this is acceptable for MVP validation but not durable for long-term production.
- Admin endpoints require `APP_API_KEY` via `X-API-Key`.
- Telegram webhook endpoint is `/api/integrations/telegram/webhook`.
- For Render, if Blueprint import is troublesome, a plain Web Service with root directory `ai-hot-comments-render-oneclick-v2` and Docker environment is the simplest fallback.

## Quick commands
### Local smoke test
Run:
`bash /workspace/ai-hot/skills/openclaw-render-ops/scripts/smoke-test.sh`

### Manual app run
Run:
`cd /workspace/ai-hot/ai-hot-comments-render-oneclick-v2 && npm ci && node src/server.js`
