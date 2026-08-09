# Execution Engine Specification

## Overview

The AI Agent Workflow Builder execution engine is a server-side, sequential step runner that orchestrates workflow execution through Hasura Actions. It enforces authorization, quota limits, retry policies, and supports pause/resume via approval gates.

---

## 1. Execution Lifecycle

```
triggerWorkflowRun(workflow_id, input)
        ↓
  [1] Load workflow + organization + steps
        ↓
  [2] Verify userId ∈ org_members with role owner|editor
        ↓  (reject viewer, non-member, Org B user)
  [3] Verify workflow is active
        ↓
  [4] Check organization usage_calls < usage_limit
        ↓  (reject if quota exhausted)
  [5] Create workflow_run (status: running)
        ↓
  [6] Execute steps sequentially (position ASC)
        ↓
  For each step:
    ├─ approval_gate → pause workflow, stop execution
    ├─ llm_call / http_request → execute with retry
    ├─ conditional_branch → evaluate, jump to target position
    ├─ db_write / notify → execute (owner-only creation enforced by Hasura)
    ↓
  [7] All steps complete → workflow_run.status = completed
        ↓
  [8] Increment organization.usage_calls
```

### Status Transitions

| Transition | Trigger |
| :--- | :--- |
| `pending` → `running` | Workflow run created |
| `running` → `completed` | All steps finished successfully |
| `running` → `failed` | A step failed after all retries |
| `running` → `paused` | An `approval_gate` step is reached |
| `paused` → `running` | An authorized user approves the gate |

---

## 2. Step Run Lifecycle

For every step execution:

1. Create `step_runs` record with `status: running`, `attempt_count: 1`, `started_at: now()`.
2. Store the step input (previous step output or workflow input).
3. Execute the step handler.
4. **On success**: `status = completed`, store output, set `completed_at`.
5. **On failure**: increment `attempt_count`, retry if `attempt_count < max_attempts`.
6. **On final failure**: `status = failed`, store error, propagate failure to `workflow_runs`.

---

## 3. Supported Step Configurations

### `llm_call`

Calls a real LLM API provider (Groq / Gemini / OpenRouter).

**Config JSONB**:
```json
{
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "system_prompt": "You are a helpful assistant.",
  "prompt": "Analyze sentiment for: {{input.text}}",
  "temperature": 0.2,
  "max_tokens": 500,
  "max_attempts": 2
}
```

**Output**:
```json
{
  "text": "The sentiment is positive...",
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "usage": { "prompt_tokens": 15, "completion_tokens": 28 }
}
```

**Variable interpolation**: `{{input.field}}`, `{{step_1.text}}`, `{{workflow_input.key}}` are supported in `prompt` and `system_prompt`.

**Dev mode**: When `LLM_API_KEY` is unconfigured, the LLM handler returns a provider string explicitly marked `dev-stub-unconfigured` to prevent un-keyed calls from being mistaken for real LLM executions in production logs.

---

### `http_request`

Generic outbound HTTP request.

**Config JSONB**:
```json
{
  "method": "POST",
  "url": "https://api.example.com/v1/events",
  "headers": { "X-Custom": "value" },
  "body": { "key": "{{input.data}}" },
  "timeout_ms": 10000,
  "max_attempts": 2
}
```

**Output**:
```json
{
  "status": 200,
  "status_text": "OK",
  "data": { ... },
  "headers": { ... }
}
```

**Protocol Security & SSRF Protection**:
- Only `http:` and `https:` protocols are permitted. Protocol schemes like `file://`, `ftp://`, and `javascript:` are rejected before request dispatch.
- Authorization headers are stripped from recorded output logs.
- *SSRF Note*: Arbitrary outbound URLs are supported per assignment spec. In restricted production environments, an URL allowlist filter can be added.

---

### `conditional_branch`

Evaluates a condition on the previous step's output and jumps to a target step position.

**Config JSONB**:
```json
{
  "condition": {
    "path": "text",
    "operator": "contains",
    "value": "positive"
  },
  "if_true_position": 4,
  "if_false_position": 5
}
```

**Supported operators**:
| Operator | Description |
| :--- | :--- |
| `equals` | Case-insensitive string equality |
| `not_equals` | Negated equality |
| `contains` | Substring match (case-insensitive) |
| `not_contains` | Negated substring match |

**Safety**: Evaluates clean, deterministic operators. No arbitrary JavaScript `eval()`.

---

### `approval_gate`

Pauses workflow execution until an authorized user approves.

**Config JSONB**:
```json
{
  "required_role": "owner",
  "timeout_hours": 24,
  "message": "This workflow requires owner sign-off before proceeding."
}
```

**Behavior**:
- `step_runs.status` → `waiting`
- `workflow_runs.status` → `paused`
- Execution loop stops immediately (subsequent steps are not executed)
- Persisted in PostgreSQL database via Hasura

**Resume**: Via `approveStepRun(step_run_id)` Action. Verifies:
1. Request has valid `x-hasura-admin-secret` header matching `NHOST_ADMIN_SECRET`.
2. Approver (`x-hasura-user-id`) belongs to the workflow's organization in `org_members`.
3. Approver's role meets or exceeds `required_role`.
4. `step_runs.status == 'waiting'` AND `workflow_runs.status == 'paused'` (re-approving completed or cancelled runs is rejected).

---

## 4. Retry Behavior

- `max_attempts` is clamped between **1 and 5** attempts to prevent infinite or unbounded retry loops.
- `attempt_count` is persisted on `step_runs` for every attempt.
- Step failure after all attempts marks both `step_runs.status = failed` and `workflow_runs.status = failed`.

---

## 5. Quota Behavior

- Organization quota is checked against the workflow's actual organization record loaded from Hasura (`usage_calls < usage_limit`). Clients cannot specify an alternate `org_id` to bypass quota checks.
- Usage is incremented (`usage_calls += 1`) via Hasura GraphQL mutation ONLY upon successful workflow run completion.

---

## 6. Authentication & Persistence Configuration

- **Hasura Secret Enforcement**: Hasura Action endpoints require `x-hasura-admin-secret` header matching `NHOST_ADMIN_SECRET`. Requests without matching credentials return `401 Unauthorized`.
- **Database Persistence**: Hasura GraphQL is used as the primary data store. If Hasura is unreachable, operations throw a explicit connection error rather than silently storing state in memory.
- **Opt-in Dev Mock**: In-memory storage is explicitly opt-in via `ENGINE_DEV_MOCK=true` for isolated local testing without a live database.

---

## 7. Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `NHOST_ADMIN_SECRET` | **Yes** | Shared secret for Hasura Action webhook authentication |
| `NHOST_GRAPHQL_URL` | **Yes** | Hasura GraphQL Engine endpoint URL |
| `LLM_API_KEY` | For real LLM | API key for Groq / Gemini / OpenRouter |
| `ENGINE_DEV_MOCK` | No (default: `false`) | Set to `true` for standalone in-memory test mode |
