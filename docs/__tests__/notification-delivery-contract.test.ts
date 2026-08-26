import { readFileSync } from 'fs';
import { join } from 'path';

describe('notification delivery documentation contract', () => {
  const root = process.cwd();
  const deployment = readFileSync(join(root, 'docs/DEPLOYMENT.md'), 'utf8');
  const envTemplate = readFileSync(join(root, 'env.template'), 'utf8');

  it('states in supported deployment docs that email delivery is unsupported', () => {
    expect(deployment).toMatch(/Email notification delivery is not supported/i);
    expect(deployment).toMatch(/not a production dependency/i);
  });

  it('does not instruct normal production deployment to activate the dormant email path', () => {
    expect(deployment).not.toMatch(
      /supabase functions deploy send-notifications/i
    );
    expect(deployment).not.toMatch(/send-daily-notifications/);
    expect(deployment).toMatch(
      /Do not deploy that function, configure pg_cron for it, or require `RESEND_API_KEY` \/ `SEND_NOTIFICATIONS_SECRET`/
    );
  });

  it('marks RESEND_API_KEY as an unsupported inactive feature in env.template', () => {
    const resendSection = envTemplate.slice(
      envTemplate.indexOf('RESEND_API_KEY') - 400,
      envTemplate.indexOf('RESEND_API_KEY') + 80
    );

    expect(envTemplate).toContain('RESEND_API_KEY');
    expect(resendSection).toMatch(/unsupported|inactive|not supported/i);
    expect(resendSection).toMatch(/not required/i);
  });
});
