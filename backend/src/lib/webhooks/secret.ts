import crypto from 'crypto'
import { decryptSecret, encryptSecret } from '../secretBox.js'

/**
 * Secret HMAC d'un endpoint : 32 octets aléatoires en hexadécimal, stocké
 * chiffré (AES-256-GCM via secretBox — clé CREDENTIALS_KEY). Il doit rester
 * déchiffrable pour signer chaque envoi, d'où le chiffrement plutôt qu'un
 * hash. Affiché en clair une seule fois, jamais loggé.
 */

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function encryptWebhookSecret(plain: string): string {
  return encryptSecret(plain)
}

export function decryptWebhookSecret(stored: string): string {
  return decryptSecret(stored)
}
