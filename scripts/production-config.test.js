const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(execFileSync('docker', [
  'compose', '-f', 'docker-compose.prod.yml', 'config', '--no-interpolate', '--format', 'json',
], { cwd: root, encoding: 'utf8' }));

test('call and recording use the same explicitly configured LiveKit API', () => {
  const call = config.services['call-service'].environment;
  const recording = config.services['recording-service'].environment;
  assert.equal(call.LIVEKIT_HOST, recording.LIVEKIT_HOST);
  assert.match(call.LIVEKIT_HOST, /\$\{LIVEKIT_HOST:\?/);
  assert.match(call.LIVEKIT_WS_URL, /\$\{LIVEKIT_WS_URL:\?/);
  assert.equal(call.LIVEKIT_URL, undefined);
});

test('production media requires a healthy, internal-only antivirus service', () => {
  const media = config.services['media-service'];
  assert.equal(media.environment.CLAMAV_ENABLED, 'true');
  assert.equal(media.environment.CLAMAV_HOST, 'clamav');
  assert.equal(media.depends_on.clamav.condition, 'service_healthy');
  assert.equal(config.services.clamav.ports, undefined);
  assert.match(config.services.clamav.image, /^clamav\/clamav:/);
  const daemon = readFileSync(path.join(root, 'infra/clamav/clamd.conf'), 'utf8');
  assert.match(daemon, /^StreamMaxLength 100M$/m);
  assert.match(daemon, /^AlertExceedsMax yes$/m);
});

test('private bucket initialization receives credentials and gates media startup', () => {
  const init = config.services['minio-init'];
  assert.ok(init.environment.MINIO_ROOT_USER);
  assert.ok(init.environment.MINIO_ROOT_PASSWORD);
  const entrypoint = Array.isArray(init.entrypoint) ? init.entrypoint.join(' ') : init.entrypoint;
  assert.match(entrypoint, /anonymous set none local\/nova-media/);
  assert.equal(config.services['media-service'].depends_on['minio-init'].condition, 'service_completed_successfully');
});

test('Redis healthcheck authenticates through its environment, without literal shell variables', () => {
  assert.ok(config.services.redis.environment.REDISCLI_AUTH);
  assert.deepEqual(config.services.redis.healthcheck.test, ['CMD', 'redis-cli', 'ping']);
});

test('service credentials are wired to the configured infrastructure', () => {
  for (const name of ['media-service', 'presence-service']) {
    assert.match(config.services[name].environment.RABBITMQ_URL, /RABBITMQ_PASSWORD/);
  }
  assert.match(config.services['auth-service'].environment.CENTRIFUGO_TOKEN_SECRET, /CENTRIFUGO_HMAC_SECRET/);
  assert.match(config.services['call-service'].environment.CENTRIFUGO_API_KEY, /CENTRIFUGO_API_KEY/);
});

test('preflight rejects missing or incorrect LiveKit URLs', () => {
  const env = { PATH: process.env.PATH, LIVEKIT_HOST: 'https://livekit.example.test', LIVEKIT_WS_URL: 'wss://livekit.example.test' };
  for (const name of ['JWT_SECRET', 'INTERNAL_SERVICE_KEY', 'CENTRIFUGO_WEBHOOK_SECRET', 'NOVA_SSO_SECRET',
    'POSTGRES_PASSWORD', 'MINIO_ROOT_PASSWORD', 'LIVEKIT_API_KEY', 'LIVEKIT_SECRET']) env[name] = 'abcdef'.repeat(8);
  const run = overrides => execFileSync(process.execPath, ['scripts/validate-prod-secrets.js'], {
    cwd: root, env: { ...env, ...overrides }, stdio: 'pipe',
  });
  assert.doesNotThrow(() => run({}));
  assert.throws(() => run({ LIVEKIT_HOST: '' }));
  assert.throws(() => run({ LIVEKIT_HOST: 'wss://livekit.example.test' }));
  assert.throws(() => run({ LIVEKIT_WS_URL: 'http://livekit.example.test' }));
});
