// Backward-compat shim — all logic lives in ./email/ now.
// This file lets existing `import { … } from '…/lib/email.js'` keep working
// under NodeNext module resolution.
export * from './email/index.js'
