-- Seed Data for AI Agent Workflow Builder
INSERT INTO public.organizations (id, name, usage_calls, usage_limit)
VALUES ('11111111-1111-1111-1111-111111111111', 'Acme Global', 0, 1000)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.org_members (id, org_id, user_id, role)
VALUES ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.workflows (id, org_id, name, description, active, created_by)
VALUES (
  'c1111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Customer Support Sentiment & Escalation',
  'Analyze sentiment via LLM, route via conditional branch, and seek owner approval for high risk actions.',
  true,
  'a1111111-1111-1111-1111-111111111111'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, active = EXCLUDED.active;

INSERT INTO public.workflow_steps (id, workflow_id, position, name, type, config)
VALUES
  ('d1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 1, 'LLM Sentiment Analysis', 'llm_call', '{"provider": "groq", "model": "llama-3.3-70b-versatile", "prompt": "Analyze sentiment: {{input.ticket_text}}"}'::jsonb),
  ('d2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 2, 'HTTP Fetch Metadata', 'http_request', '{"method": "GET", "url": "https://httpbin.org/get?user={{input.user_id}}"}'::jsonb),
  ('d3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 3, 'Evaluate Risk Branch', 'conditional_branch', '{"condition": {"path": "text", "operator": "contains", "value": "urgent"}, "if_true_position": 4, "if_false_position": 5}'::jsonb),
  ('d4444444-4444-4444-4444-444444444444', 'c1111111-1111-1111-1111-111111111111', 4, 'Owner Approval Gate', 'approval_gate', '{"required_role": "owner", "message": "Owner approval required for urgent escalation."}'::jsonb),
  ('d5555555-5555-5555-5555-555555555555', 'c1111111-1111-1111-1111-111111111111', 5, 'DB Audit Log', 'db_write', '{"table": "audit_logs", "action": "insert", "payload": {"status": "processed"}}'::jsonb),
  ('d6666666-6666-6666-6666-666666666666', 'c1111111-1111-1111-1111-111111111111', 6, 'Slack Notification', 'notify', '{"channel": "slack", "recipient": "#alerts", "template": "Workflow completed for {{input.user_id}}"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, config = EXCLUDED.config;
