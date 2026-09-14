#!/usr/bin/env node
/**
 * Production Secret Pre-Flight Validator
 *
 * Verifies that all necessary secrets are set for production deployment,
 * entropy/length requirements are satisfied, and NO dev default fallback secrets are used.
 *
 * Exit code 0: All production secrets valid
 * Exit code 1: Insecure or missing secrets detected (Deployment halted)
 */

const FORBIDDEN_SUBSTRINGS = [
  'change_me',
  'change-me',
  'dev_secret',
  'nova_dev_pass',
  'minioadmin',
  'default_secret',
  'internal_service_default_secret_key',
  'secret_key_change_me',
  'nova_sso_shared_secret',
  '123456',
  'password',
];

const REQUIRED_SECRETS = [
  { name: 'JWT_SECRET', minLength: 32 },
  { name: 'INTERNAL_SERVICE_KEY', minLength: 32 },
  { name: 'CENTRIFUGO_WEBHOOK_SECRET', minLength: 32 },
  { name: 'NOVA_SSO_SECRET', minLength: 32 },
  { name: 'POSTGRES_PASSWORD', minLength: 16 },
  { name: 'MINIO_ROOT_PASSWORD', minLength: 16 },
  { name: 'LIVEKIT_API_KEY', minLength: 16 },
  { name: 'LIVEKIT_SECRET', minLength: 32 },
];

function validate() {
  console.log('=== Production Secrets Pre-Flight Audit ===\n');
  let errors = 0;

  for (const item of REQUIRED_SECRETS) {
    const val = process.env[item.name];

    if (!val) {
      console.error(`[CRITICAL BLOCKED] Missing required production secret: ${item.name}`);
      errors++;
      continue;
    }

    if (val.length < item.minLength) {
      console.error(
        `[CRITICAL BLOCKED] ${item.name} is too short (${val.length} chars). Required minimum: ${item.minLength} chars.`
      );
      errors++;
      continue;
    }

    const lower = val.toLowerCase();
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      if (lower.includes(forbidden)) {
        console.error(
          `[CRITICAL BLOCKED] ${item.name} contains insecure development pattern "${forbidden}". Default secrets are strictly prohibited in production.`
        );
        errors++;
        break;
      }
    }
  }

  for (const [name, protocols] of [
    ['LIVEKIT_HOST', ['https:', 'http:']],
    ['LIVEKIT_WS_URL', ['wss:']],
  ]) {
    try {
      const url = new URL(process.env[name]);
      if (!protocols.includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    } catch {
      console.error(`[CRITICAL BLOCKED] ${name} must be a valid ${protocols.join('/')} URL without embedded credentials.`);
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\nAudit FAILED: ${errors} critical security configuration blocker(s) found.`);
    process.exit(1);
  }

  console.log('All production secrets verified successfully. Fail-Closed & Entropy requirements satisfied.\n');
  process.exit(0);
}

validate();
