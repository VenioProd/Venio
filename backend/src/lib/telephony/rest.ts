import twilio from 'twilio'
import type { TelephonyConfig } from './index.js'

/** Seul appel sortant vers l'API REST de Twilio dans ce lot ; isolé pour être simulé dans les tests. */
export async function hangupProviderCall(config: TelephonyConfig, callSid: string): Promise<void> {
  const client = twilio(config.apiKeySid, config.apiKeySecret, {
    accountSid: config.accountSid,
    region: config.region,
    edge: config.edge,
  })
  // Terminer la branche du navigateur (appel parent) coupe aussi la branche composée.
  await client.calls(callSid).update({ status: 'completed' })
}
