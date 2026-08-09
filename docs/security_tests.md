# Security Architecture & Authorization Test Suite

This document specifies the **Two-Layer Authorization Architecture** implemented for the AI Agent Workflow Builder platform and documents the validation strategy for all 13 required security test scenarios.

---

## 1. Authorization Architecture Overview

### Layer 1 — Organization + Role Scoping (Multi-Tenant Isolation)

Every access to organization-owned data is strictly scoped through the `org_members` junction table evaluated dynamically against the authenticated user session variable (`X-Hasura-User-Id`):

```
authenticated session (X-Hasura-User-Id)
            ↓
  org_members.user_id = X-Hasura-User-Id
            ↓
  org_members.org_id = target_resource.org_id
            ↓
  Grant Access (if org_members.role satisfies action policy)
```

> [!IMPORTANT]
> **Prevention of Direct UUID Guessing (Test 7)**:
> If an Org B user attempts to query an Org A resource by supplying its exact UUID (e.g. `workflow(id: "W-ORG-A-UUID")`), Hasura evaluates the row filter:
> `workflow.organization.members.user_id = X-Hasura-User-Id`
> Because Org B user does NOT exist in Org A's `org_members`, the boolean expression evaluates to `FALSE`. Hasura returns **zero accessible rows** (`null` / empty list `[]`), exactly as if the row does not exist. Frontend filtering is never relied upon.

---

### Layer 2 — Step-Level Gating (Restricted Operations)

Sensitive step types and trigger configurations are restricted at the database / Hasura permission level:

- **Restricted Step Types**: `db_write`, `notify`
- **Restricted Trigger Type**: `webhook`

| Operation | Step / Trigger Type | Allowed Roles in `org_members` |
| :--- | :--- | :--- |
| Create/Edit/Delete Step | `llm_call`, `http_request`, `conditional_branch`, `approval_gate` | `owner`, `editor` |
| Create/Edit/Delete Step | **`db_write`**, **`notify`** | **`owner` ONLY** |
| Create/Edit/Delete Trigger | `manual`, `scheduled`, `database_event` | `owner`, `editor` |
| Create/Edit/Delete Trigger | **`webhook`** | **`owner` ONLY** |

When an `editor` role attempts a GraphQL mutation introducing a restricted step (e.g., `type: "db_write"`), Hasura's `insert_permissions` check `type: { _nin: ["db_write", "notify"] }` fails and immediately rejects the mutation with `permission_denied`.

---

## 2. Role Capability Matrix

| Entity / Action | `owner` | `editor` | `viewer` | Non-Member (Org B) |
| :--- | :--- | :--- | :--- | :--- |
| `organizations` SELECT | ✅ | ✅ | ✅ | ❌ Denied |
| `organizations` UPDATE | ✅ | ❌ | ❌ | ❌ Denied |
| `org_members` MANAGE (Insert/Update/Delete) | ✅ | ❌ | ❌ | ❌ Denied |
| `workflows` SELECT | ✅ | ✅ | ✅ | ❌ Denied |
| `workflows` INSERT / UPDATE / DELETE | ✅ | ✅ | ❌ | ❌ Denied |
| `workflow_steps` (Standard: `llm_call`, `http_request`, etc.) | ✅ | ✅ | ❌ (Select Only) | ❌ Denied |
| `workflow_steps` (Restricted: **`db_write`**, **`notify`**) | ✅ | ❌ Denied | ❌ (Select Only) | ❌ Denied |
| `workflow_triggers` (Standard: `manual`, `scheduled`, `database_event`) | ✅ | ✅ | ❌ (Select Only) | ❌ Denied |
| `workflow_triggers` (Restricted: **`webhook`**) | ✅ | ❌ Denied | ❌ (Select Only) | ❌ Denied |
| `workflow_runs` SELECT | ✅ | ✅ | ✅ | ❌ Denied |
| `workflow_runs` DIRECT CLIENT MUTATION | ❌ (Engine Only) | ❌ (Engine Only) | ❌ (Engine Only) | ❌ Denied |
| `step_runs` SELECT | ✅ | ✅ | ✅ | ❌ Denied |
| `step_runs` DIRECT CLIENT MUTATION | ❌ (Engine Only) | ❌ (Engine Only) | ❌ (Engine Only) | ❌ Denied |

---

## 3. Required Security Test Scenarios & Verification Matrix

### TEST 1: Org A Owner can read Org A Workflow
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-OWNER-UUID", X-Hasura-Role: "user"
  query GetOrgAWorkflow {
    workflows_by_pk(id: "W-ORG-A-UUID") {
      id
      name
      org_id
    }
  }
  ```
- **Expected Outcome**: Returns workflow record successfully (`200 OK`, `data.workflows_by_pk.id = "W-ORG-A-UUID"`).

---

### TEST 2: Org A Editor can edit Org A Workflow
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-EDITOR-UUID", X-Hasura-Role: "user"
  mutation UpdateOrgAWorkflow {
    update_workflows_by_pk(
      pk_columns: { id: "W-ORG-A-UUID" }
      _set: { description: "Updated by Editor" }
    ) {
      id
      description
    }
  }
  ```
- **Expected Outcome**: Update succeeds (`data.update_workflows_by_pk.description = "Updated by Editor"`).

---

### TEST 3: Org A Viewer can read Org A Workflow
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-VIEWER-UUID", X-Hasura-Role: "user"
  query ViewOrgAWorkflow {
    workflows_by_pk(id: "W-ORG-A-UUID") {
      id
      name
    }
  }
  ```
- **Expected Outcome**: Returns workflow record successfully.

---

### TEST 4: Org A Viewer cannot modify Org A Workflow
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-VIEWER-UUID", X-Hasura-Role: "user"
  mutation ModifyOrgAWorkflow {
    update_workflows_by_pk(
      pk_columns: { id: "W-ORG-A-UUID" }
      _set: { name: "Malicious Rename" }
    ) {
      id
    }
  }
  ```
- **Expected Outcome**: Rejection error (`permission_denied` or `data.update_workflows_by_pk = null`).

---

### TEST 5: Org A Viewer cannot trigger a workflow via direct `workflow_runs` mutation
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-VIEWER-UUID", X-Hasura-Role: "user"
  mutation TriggerWorkflowDirect {
    insert_workflow_runs_one(object: {
      workflow_id: "W-ORG-A-UUID",
      trigger_type: "manual",
      status: "running"
    }) {
      id
    }
  }
  ```
- **Expected Outcome**: Mutation fails (`field insert_workflow_runs_one not found in schema` or `permission_denied` because direct client execution mutations are prohibited).

---

### TEST 6: Org B User cannot read Org A Workflow
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-B-OWNER-UUID", X-Hasura-Role: "user"
  query GetOrgAWorkflowsAsOrgB {
    workflows(where: { org_id: { _eq: "ORG-A-UUID" } }) {
      id
      name
    }
  }
  ```
- **Expected Outcome**: Returns empty array (`data.workflows = []`).

---

### TEST 7: Org B User cannot read Org A Workflow by guessing UUID
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-B-OWNER-UUID", X-Hasura-Role: "user"
  query GuessOrgAWorkflowUUID {
    workflows_by_pk(id: "W-ORG-A-UUID") {
      id
      name
    }
  }
  ```
- **Expected Outcome**: Returns null (`data.workflows_by_pk = null`). Zero data leaked.

---

### TEST 8: Org B User cannot read Org A Workflow Steps
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-B-OWNER-UUID", X-Hasura-Role: "user"
  query GetOrgAStepsAsOrgB {
    workflow_steps(where: { workflow_id: { _eq: "W-ORG-A-UUID" } }) {
      id
      type
    }
  }
  ```
- **Expected Outcome**: Returns empty array (`data.workflow_steps = []`).

---

### TEST 9: Org B User cannot read Org A Runs
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-B-OWNER-UUID", X-Hasura-Role: "user"
  query GetOrgARunsAsOrgB {
    workflow_runs(where: { workflow_id: { _eq: "W-ORG-A-UUID" } }) {
      id
      status
    }
  }
  ```
- **Expected Outcome**: Returns empty array (`data.workflow_runs = []`).

---

### TEST 10: Org A Editor cannot create a `db_write` step
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-EDITOR-UUID", X-Hasura-Role: "user"
  mutation CreateDbWriteStepAsEditor {
    insert_workflow_steps_one(object: {
      workflow_id: "W-ORG-A-UUID",
      position: 2,
      name: "Restricted DB Write",
      type: "db_write",
      config: {}
    }) {
      id
    }
  }
  ```
- **Expected Outcome**: Hasura rejects mutation (`permission_denied` check constraint failure for type `db_write`).

---

### TEST 11: Org A Editor cannot create a `notify` step
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-EDITOR-UUID", X-Hasura-Role: "user"
  mutation CreateNotifyStepAsEditor {
    insert_workflow_steps_one(object: {
      workflow_id: "W-ORG-A-UUID",
      position: 3,
      name: "Restricted Notification",
      type: "notify",
      config: {}
    }) {
      id
    }
  }
  ```
- **Expected Outcome**: Hasura rejects mutation (`permission_denied` check constraint failure for type `notify`).

---

### TEST 12: Org A Editor cannot create a `webhook` trigger
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-EDITOR-UUID", X-Hasura-Role: "user"
  mutation CreateWebhookTriggerAsEditor {
    insert_workflow_triggers_one(object: {
      workflow_id: "W-ORG-A-UUID",
      type: "webhook",
      config: {}
    }) {
      id
    }
  }
  ```
- **Expected Outcome**: Hasura rejects mutation (`permission_denied` check constraint failure for trigger type `webhook`).

---

### TEST 13: Org A Owner CAN create restricted resources (`db_write`, `notify`, `webhook`)
- **GraphQL Request**:
  ```graphql
  # Headers: X-Hasura-User-Id: "USER-ORG-A-OWNER-UUID", X-Hasura-Role: "user"
  mutation CreateDbWriteStepAsOwner {
    insert_workflow_steps_one(object: {
      workflow_id: "W-ORG-A-UUID",
      position: 2,
      name: "Authorized DB Write",
      type: "db_write",
      config: {}
    }) {
      id
      type
    }
  }
  ```
- **Expected Outcome**: Insertion succeeds (`data.insert_workflow_steps_one.type = "db_write"`).

---

## 4. Environment Note on Integration Testing

> [!NOTE]
> Since a live remote Nhost Cloud deployment has not yet been connected to this local project workspace, Hasura metadata permissions have been statically validated via YAML parsing and SQL assertion test script (`nhost/tests/security_test_suite.sql`). Connecting a live Nhost backend (`nhost up` or Nhost Cloud CLI) will immediately enforce these metadata rules against live JWT sessions.
