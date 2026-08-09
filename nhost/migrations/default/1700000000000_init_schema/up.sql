-- PostgreSQL Migration: Initial Schema for AI Agent Workflow Builder

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function for updating timestamp
CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
RETURNS trigger AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$ LANGUAGE plpgsql;

-- ENUM Types
CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'paused', 'waiting', 'cancelled');

-- Organizations Table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  usage_calls INT NOT NULL DEFAULT 0,
  usage_limit INT NOT NULL DEFAULT 1000,
  usage_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_public_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION set_current_timestamp_updated_at();

-- Organization Members Table
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role org_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_members_org_id_user_id_key UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.org_members(org_id);

-- Workflows Table
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflows_org_id ON public.workflows(org_id);
CREATE INDEX idx_workflows_created_by ON public.workflows(created_by);

CREATE TRIGGER set_public_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW
  EXECUTE FUNCTION set_current_timestamp_updated_at();

-- Workflow Steps Table
CREATE TABLE public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  position INT NOT NULL,
  name TEXT NOT NULL,
  type step_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_steps_workflow_id_position_key UNIQUE (workflow_id, position)
);

CREATE INDEX idx_workflow_steps_workflow_id_pos ON public.workflow_steps(workflow_id, position);

CREATE TRIGGER set_public_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION set_current_timestamp_updated_at();

-- Workflow Triggers Table
CREATE TABLE public.workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  type trigger_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_triggers_workflow_id ON public.workflow_triggers(workflow_id);

CREATE TRIGGER set_public_workflow_triggers_updated_at
  BEFORE UPDATE ON public.workflow_triggers
  FOR EACH ROW
  EXECUTE FUNCTION set_current_timestamp_updated_at();

-- Workflow Runs Table
CREATE TABLE public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  triggered_by UUID,
  trigger_type trigger_type NOT NULL,
  status run_status NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_runs_workflow_id ON public.workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON public.workflow_runs(status);
CREATE INDEX idx_workflow_runs_created_at ON public.workflow_runs(created_at DESC);

-- Step Runs Table
CREATE TABLE public.step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  status run_status NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error JSONB,
  attempt_count INT NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_step_runs_workflow_run_id ON public.step_runs(workflow_run_id);
CREATE INDEX idx_step_runs_workflow_step_id ON public.step_runs(workflow_step_id);
CREATE INDEX idx_step_runs_status ON public.step_runs(status);

-- View for Monthly Organization Usage Aggregation
CREATE OR REPLACE VIEW public.organization_monthly_usage AS
SELECT 
  o.id AS org_id,
  o.name AS org_name,
  o.usage_limit,
  date_trunc('month', wr.created_at) AS month,
  COUNT(DISTINCT wr.id) AS total_workflow_runs,
  COUNT(sr.id) AS total_step_runs,
  o.usage_calls AS static_usage_calls
FROM public.organizations o
LEFT JOIN public.workflows w ON w.org_id = o.id
LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
LEFT JOIN public.step_runs sr ON sr.workflow_run_id = wr.id
GROUP BY o.id, o.name, o.usage_limit, date_trunc('month', wr.created_at);
