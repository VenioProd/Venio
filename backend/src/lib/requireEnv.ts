const REQUIRED = ['JWT_SECRET', 'MONGODB_URI', 'ENCRYPTION_KEY'];

export function requireEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}
