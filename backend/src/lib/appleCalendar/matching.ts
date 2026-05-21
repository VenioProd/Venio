/**
 * Rapprochement best-effort entre un événement Apple Calendar et une
 * EducationClass existante du cockpit intervenant.
 *
 * Le calendrier reste lecture seule : ce module ne crée ni ne modifie de
 * données Mongo. Il aide juste à transformer un titre / lieu / description
 * iCloud en un lien cliquable vers la classe du cockpit lorsque c'est
 * possible.
 *
 * Heuristique :
 *   1) Normalisation NFD (sans accent), minuscule, trim, ponctuation -> espaces.
 *   2) Tokens significatifs uniquement (≥ 2 caractères, hors stop-words FR).
 *   3) Score par classe = exact name match (forcé), sinon overlap pondéré
 *      sur name / school / program / level / tags / notes.
 *   4) Si l'inférence existante a déjà détecté l'école (`EMA`, `ESVE`, etc.),
 *      on exige que la classe candidate appartienne à cette école.
 *   5) Seuil minimum pour éviter les rapprochements hasardeux.
 */

export interface ClassCandidate {
  _id: string
  name: string
  school: string
  level: string
  program: string
  color?: string
  tags?: string[]
  notes?: string
}

export interface MatchInput {
  title: string
  location?: string
  description?: string
  inferredSchool?: string | null
  inferredClassLabel?: string | null
}

export interface MatchedClass {
  classId: string
  className: string
  school: string
  color: string
  score: number
  reason: 'exact-name' | 'tokens'
}

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'a', 'au', 'aux',
  'et', 'ou', 'avec', 'sans', 'pour', 'sur', 'en', 'dans', 'par', 'cours',
  'classe', 'seance', 'séance', 'salle', 'amphi', 'tp', 'td', 'cm',
])

function normalize(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(input: string | null | undefined): string[] {
  if (!input) return []
  return normalize(input)
    .split(' ')
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok))
}

function uniqueTokenSet(parts: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>()
  for (const p of parts) {
    for (const t of tokens(p)) out.add(t)
  }
  return out
}

/**
 * Rapproche un événement avec la meilleure classe candidate.
 * Retourne null si aucune classe ne dépasse le seuil de confiance.
 */
export function matchEventToClass(
  event: MatchInput,
  classes: ClassCandidate[],
): MatchedClass | null {
  if (!classes.length) return null

  const eventText = `${event.title} ${event.location || ''} ${event.description || ''}`
  const eventTokens = uniqueTokenSet([event.title, event.location, event.description, event.inferredClassLabel])
  const normalizedEvent = normalize(eventText)
  const inferredSchool = event.inferredSchool ? normalize(event.inferredSchool) : ''

  let best: MatchedClass | null = null

  for (const klass of classes) {
    const normalizedName = normalize(klass.name)
    if (!normalizedName) continue

    // Si l'inférence a trouvé une école, ne matcher que sur cette école.
    const normalizedSchool = normalize(klass.school)
    if (inferredSchool && normalizedSchool && normalizedSchool !== inferredSchool) {
      continue
    }

    // 1) Match exact du nom de classe dans le texte de l'événement.
    if (normalizedName.length >= 3 && normalizedEvent.includes(normalizedName)) {
      const candidate: MatchedClass = {
        classId: klass._id,
        className: klass.name,
        school: klass.school || '',
        color: klass.color || '#22C55E',
        score: 100,
        reason: 'exact-name',
      }
      if (!best || candidate.score > best.score) best = candidate
      continue
    }

    // 2) Overlap pondéré sur les tokens significatifs.
    const classTokens = uniqueTokenSet([
      klass.name,
      klass.school,
      klass.program,
      klass.level,
      ...(klass.tags || []),
    ])
    if (!classTokens.size) continue

    let score = 0
    for (const tok of classTokens) {
      if (eventTokens.has(tok)) {
        // Tokens "structurants" (école / niveau / programme) -> plus de poids.
        const isSchoolTok = normalize(klass.school).split(' ').includes(tok)
        const isLevelTok = normalize(klass.level).split(' ').includes(tok)
        const isProgramTok = normalize(klass.program).split(' ').includes(tok)
        if (isSchoolTok) score += 5
        else if (isLevelTok || isProgramTok) score += 3
        else score += 1
      }
    }

    // Bonus si l'école inférée matche.
    if (inferredSchool && normalizedSchool === inferredSchool) score += 5

    if (score >= 6) {
      const candidate: MatchedClass = {
        classId: klass._id,
        className: klass.name,
        school: klass.school || '',
        color: klass.color || '#22C55E',
        score,
        reason: 'tokens',
      }
      if (!best || candidate.score > best.score) best = candidate
    }
  }

  return best
}

/**
 * Variante pratique pour traiter une liste d'événements en une seule passe.
 */
export function matchEventsToClasses<T extends MatchInput>(
  events: T[],
  classes: ClassCandidate[],
): Array<T & { match: MatchedClass | null }> {
  return events.map((ev) => ({ ...ev, match: matchEventToClass(ev, classes) }))
}
