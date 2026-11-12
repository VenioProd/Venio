/**
 * Migration one-shot : la règle prédéfinie « nouveau-lead-formulaire » reconnaît
 * la source `FORMULAIRE_SITE`, celle qu'écrit réellement le formulaire public.
 *
 * Les règles prédéfinies ne sont insérées qu'une fois (`$setOnInsert`) : celles
 * déjà en base gardent l'ancienne liste ['Site web', 'Formulaire', 'Site'] et ne
 * se déclencheraient jamais sur un lead du site. On ajoute la valeur à la
 * condition « source in [...] » existante, sans toucher au reste (statut,
 * actions, autres conditions éventuellement modifiées à la main).
 *
 * Idempotente : `$addToSet` n'ajoute la valeur qu'une fois.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/005-crm-form-rule-source.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import CrmRule from '../../src/models/CrmRule.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

export const FORM_RULE_KEY = 'nouveau-lead-formulaire'
export const FORM_SOURCE = 'FORMULAIRE_SITE'

/** Ajoute FORMULAIRE_SITE aux conditions « source in [...] » de la règle formulaire. Rend le nombre de règles modifiées. */
export async function addFormSourceToRule(): Promise<number> {
  // Collection native : la valeur d'une condition est un champ Mixed, que les
  // filtres de tableau de Mongoose ne savent pas typer.
  const res = await CrmRule.collection.updateMany(
    {
      systemKey: FORM_RULE_KEY,
      'conditions.items': {
        $elemMatch: { field: 'source', operator: 'in', value: { $type: 'array', $ne: FORM_SOURCE } },
      },
    },
    { $addToSet: { 'conditions.items.$[cond].value': FORM_SOURCE } },
    { arrayFilters: [{ 'cond.field': 'source', 'cond.operator': 'in', 'cond.value': { $type: 'array' } }] },
  )
  return res.modifiedCount
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri)
  logger.info({ modified: await addFormSourceToRule() }, 'form rule source')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /005-crm-form-rule-source/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
