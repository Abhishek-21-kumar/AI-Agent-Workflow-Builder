# Production Deployment & Operations Guide

This guide details local development, testing, configuration, and production deployment procedures for the **AI Agent Workflow Builder**.

---

## 1. Core Architecture Overview

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Vanilla TailwindCSS. Deployed to **Vercel**.
- **Backend Infrastructure**: **Nhost Cloud** (PostgreSQL 14, Hasura GraphQL Engine v2.48.10, Nhost Auth 0.49.1, Nhost Storage 0.14.0).
- **Execution Engine & Action Handlers**: Next.js API route handlers acting as Hasura Action & Trigger webhooks.

---

## 2. Environment Variables Specification

### Backend & Cloud Environment Variables (`.env` / Nhost Secrets)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `HASURA_GRAPHQL_ADMIN_SECRET` | Hasura admin secret | `nhost-admin-secret` |
| `ACTION_BASE_URL` | Base URL for action webhooks | `https://ai-agent-workflow-builder.vercel.app` |
| `LLM_API_KEY` | Groq / Gemini / OpenRouter API Key | Configured in Nhost Secrets |
| `LLM_PROVIDER` | LLM Provider identifier | `groq` |
| `LLM_MODEL` | LLM Model identifier | `llama-3.3-70b-versatile` |
| `LLM_ENDPOINT` | OpenAI-compatible endpoint | `https://api.groq.com/openai/v1/chat/completions` |

### Frontend Environment Variables (`.env.production`)

| Variable | Description | Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | Nhost production subdomain | `jvbfbauzspkhupdgbaii` |
| `NEXT_PUBLIC_NHOST_REGION` | Nhost production region | `ap-south-1` |
| `NHOST_GRAPHQL_URL` | Hasura production GraphQL URL | `https://jvbfbauzspkhupdgbaii.graphql.ap-south-1.nhost.run/v1/graphql` |

---

## 3. Local Development Setup

1. **Start Nhost local services**:
   ```bash
   wsl bash -c "cd /path/to/project && nhost up"
   ```
2. **Validate Nhost configuration**:
   ```bash
   wsl bash -c "cd /path/to/project && nhost config validate"
   ```
3. **Start Next.js frontend dev server**:
   ```bash
   cd frontend && npm run dev
   ```

---

## 4. Running the Test Suite

```bash
# 1. Run 37-Test Execution Engine & Security Unit Test Suite
cd frontend && npx tsx ../functions/tests/execution_engine.test.ts

# 2. Run Real LLM Live Smoke Test (Groq API)
npx tsx functions/tests/llm_live_smoke_test.ts

# 3. Run TypeScript Type Check
cd frontend && npx tsc --noEmit

# 4. Run Frontend Linting
cd frontend && npm run lint

# 5. Run Frontend Production Build
cd frontend && npm run build
```

---

## 5. Nhost Cloud Backend Deployment

1. **Ensure Git repository is linked to Nhost**:
   ```bash
   nhost link
   ```
2. **Push commits to GitHub**:
   ```bash
   git push origin main
   ```
3. **Trigger Cloud Deployment via CLI (or GitHub Webhook)**:
   ```bash
   nhost deployments new <commit_sha> --ref <commit_sha> --subdomain jvbfbauzspkhupdgbaii --follow
   ```

---

## 6. Vercel Frontend Deployment

1. **Login to Vercel CLI**:
   ```bash
   npx vercel login
   ```
2. **Link & Deploy Frontend**:
   ```bash
   cd frontend
   npx vercel --prod
   ```
3. **Set Environment Variables on Vercel**:
   - `NEXT_PUBLIC_NHOST_SUBDOMAIN` = `jvbfbauzspkhupdgbaii`
   - `NEXT_PUBLIC_NHOST_REGION` = `ap-south-1`
   - `NHOST_GRAPHQL_URL` = `https://jvbfbauzspkhupdgbaii.graphql.ap-south-1.nhost.run/v1/graphql`

---

## 7. Troubleshooting

- **Metadata Apply Failure**: Ensure `actions.graphql` contains `type Mutation` and input definitions for every action in `actions.yaml`.
- **Database Source `default` error**: Ensure `database_url` in `databases.yaml` references `from_env: HASURA_GRAPHQL_DATABASE_URL`.
- **Approval Gate Pause**: When an approval gate step executes, check `step_runs.status == 'waiting'` and invoke `approveStepRun` action as an `owner` role.
