import dotenv from 'dotenv'
import { sendTestEmail } from '../lib/email.js'

dotenv.config()

const to: string = process.argv[2] || 'bentv@me.com'

async function main(): Promise<void> {
  console.log('Envoi d\u2019un email de test à', to, '...')
  const result = await sendTestEmail(to)
  if (result.sent) {
    console.log('OK — Email envoyé.')
  } else {
    console.error('Échec:', result.error)
    process.exit(1)
  }
}

main()
