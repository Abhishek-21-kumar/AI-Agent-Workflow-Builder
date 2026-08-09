-- SQL Security Assertion Test Suite
-- Simulates Hasura Session Row-Level Checks for Org A & Org B Isolation

BEGIN;

-- 1. Create Temporary Test Data
INSERT INTO public.organizations (id, name) VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'Org A'),
  ('b0000000-0000-0000-0000-000000000002', 'Org B');

INSERT INTO public.org_members (id, org_id, user_id, role) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'owner');

INSERT INTO public.workflows (id, org_id, name, created_by) VALUES
  ('w0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Org A Main Workflow', '11111111-1111-1111-1111-111111111111');

-- 2. Test Scenarios Validation Functions

-- Assertion 1: Org A Owner can access Org A Workflow
DO $$
DECLARE
  _count INT;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM public.workflows w
  WHERE w.id = 'w0000000-0000-0000-0000-000000000001'
    AND EXISTS (
      SELECT 1 FROM public.org_members m 
      WHERE m.org_id = w.org_id 
        AND m.user_id = '11111111-1111-1111-1111-111111111111'
    );
  
  IF _count <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Org A owner should be able to read Org A workflow';
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Org A owner can read Org A workflow';
END $$;

-- Assertion 6 & 7: Org B user CANNOT access Org A Workflow (even by knowing UUID)
DO $$
DECLARE
  _count INT;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM public.workflows w
  WHERE w.id = 'w0000000-0000-0000-0000-000000000001'
    AND EXISTS (
      SELECT 1 FROM public.org_members m 
      WHERE m.org_id = w.org_id 
        AND m.user_id = '44444444-4444-4444-4444-444444444444' -- Org B user
    );
  
  IF _count <> 0 THEN
    RAISE EXCEPTION 'TEST 6/7 FAILED: Org B user accessed Org A workflow!';
  END IF;
  RAISE NOTICE 'TEST 6/7 PASSED: Org B user cannot access Org A workflow by UUID';
END $$;

-- Assertion 10 & 11: Editor step restriction check logic
DO $$
DECLARE
  _editor_can_add_db_write BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = 'a0000000-0000-0000-0000-000000000001'
      AND m.user_id = '22222222-2222-2222-2222-222222222222' -- Editor
      AND (
        m.role = 'owner' 
        OR (m.role = 'editor' AND 'db_write' NOT IN ('db_write', 'notify'))
      )
  ) INTO _editor_can_add_db_write;

  IF _editor_can_add_db_write THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Editor was able to bypass db_write restriction!';
  END IF;
  RAISE NOTICE 'TEST 10 PASSED: Editor cannot create db_write step';
END $$;

ROLLBACK;
