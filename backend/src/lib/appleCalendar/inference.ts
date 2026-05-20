/**
 * Heuristiques best-effort pour deviner l'école / la classe d'un événement
 * Apple Calendar à partir de son titre, lieu et description.
 *
 * Ce n'est pas un moteur d'ERP : on se contente de rapprocher un mot-clé
 * connu (EMA, ESVE, MBWAY, Tunon, GGI, ISIFA…) avec l'événement pour aider
 * Raphael à scanner sa semaine. Toujours best-effort : si rien n'est trouvé,
 * `school` reste null côté API.
 */

const SCHOOL_KEYWORDS: Array<{ school: string; patterns: RegExp[] }> = [
  { school: 'EMA', patterns: [/\bEMA\b/i, /école\s+du\s+management/i] },
  { school: 'ESVE', patterns: [/\bESVE\b/i] },
  { school: 'MBWAY', patterns: [/\bMBWAY\b/i, /MB\s*WAY/i] },
  { school: 'Tunon', patterns: [/\bTunon\b/i] },
  { school: 'GGI', patterns: [/\bGGI\b/i] },
  { school: 'ISIFA', patterns: [/\bISIFA\b/i, /Igensia/i] },
]

export function inferSchool(...texts: Array<string | undefined | null>): string | null {
  const combined = texts.filter(Boolean).join(' ')
  if (!combined) return null
  for (const { school, patterns } of SCHOOL_KEYWORDS) {
    if (patterns.some((p) => p.test(combined))) return school
  }
  return null
}

const CLASS_PATTERNS = [
  /\b(BTS|BUT|BAC\+?\d|M[12]|B[123]|L[123]|BACHELOR|MASTER|MBA)\b[^,;\n]*/i,
  /\b(NDRC|MCO|GPME|SAM|CG|MUC|TC|GEA|GACO|COMM?)\b[^,;\n]*/i,
]

export function inferClassLabel(...texts: Array<string | undefined | null>): string | null {
  const combined = texts.filter(Boolean).join(' ')
  if (!combined) return null
  for (const re of CLASS_PATTERNS) {
    const m = re.exec(combined)
    if (m) return m[0].trim().replace(/\s+/g, ' ').slice(0, 64)
  }
  return null
}
