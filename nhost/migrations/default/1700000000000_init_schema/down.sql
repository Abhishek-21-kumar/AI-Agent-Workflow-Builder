-- PostgreSQL Migration Down Script

DROP VIEW IF EXISTS public.organization_monthly_usage;

DROP TABLE IF EXISTS public.step_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_triggers CASCADE;
DROP TABLE IF EXISTS public.workflow_steps CASCADE;
DROP TABLE IF EXISTS public.workflows CASCADE;
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

DROP TYPE IF EXISTS run_status;
DROP TYPE IF EXISTS trigger_type;
DROP TYPE IF EXISTS step_type;
DROP TYPE IF EXISTS org_role;

DROP FUNCTION IF EXISTS set_current_timestamp_updated_at();
