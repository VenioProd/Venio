import type { BetaReproducibility, BetaRunStatus, BetaSeverity, BetaVerdict } from '../../models/BetaRun.js'

/**
 * Vues destinées à la surface testeur.
 *
 * Le principe est de construire la réponse par ajout, jamais par retrait : on
 * part de rien et on ne pose que les champs autorisés. Une omission ne peut
 * donc pas laisser passer une donnée d'un autre testeur, contrairement à un
 * `delete` sur l'objet complet.
 */

export interface SerializableAttachment {
  _id: unknown
  originalName: string
  mimeType: string
  size: number
}

export interface SerializableRunContext {
  url: string | null
  userAgent: string | null
  viewportWidth: number | null
  viewportHeight: number | null
  isMobile: boolean | null
}

export interface SerializableRun {
  _id: unknown
  scenario: unknown
  tester: string | null
  user: string | null
  verdict: BetaVerdict
  severity: BetaSeverity | null
  reproducibility: BetaReproducibility | null
  status: BetaRunStatus
  failedStep: number | null
  title: string
  body: string
  context: SerializableRunContext | null
  attachments: SerializableAttachment[]
  confirmations: string[]
  createdAt: Date
}

export interface TesterRunView {
  _id: string
  scenario: string
  mine: boolean
  verdict: BetaVerdict
  severity: BetaSeverity | null
  status: BetaRunStatus
  failedStep: number | null
  title: string
  confirmationCount: number
  confirmedByMe: boolean
  createdAt: Date
  body?: string
  reproducibility?: BetaReproducibility | null
  context?: SerializableRunContext | null
  attachments?: SerializableAttachment[]
}

/**
 * Un testeur voit ses propres retours en entier, et ceux des autres réduits à
 * ce qui permet de dire « j'ai le même souci » : titre, gravité, statut, étape.
 * Ni corps, ni captures, ni contexte technique — un user-agent et une taille
 * d'écran suffisent souvent à réidentifier quelqu'un.
 *
 * Les verdicts rendus par l'équipe ne sortent pas du tout.
 */
export function serializeRunsForTester(runs: SerializableRun[], viewerTesterId: string): TesterRunView[] {
  const views: TesterRunView[] = []

  for (const run of runs) {
    if (!run.tester) continue

    const confirmations = run.confirmations ?? []
    const base: TesterRunView = {
      _id: String(run._id),
      scenario: String(run.scenario),
      mine: String(run.tester) === viewerTesterId,
      verdict: run.verdict,
      severity: run.severity ?? null,
      status: run.status,
      failedStep: run.failedStep ?? null,
      title: run.title,
      confirmationCount: confirmations.length,
      confirmedByMe: confirmations.some((id) => String(id) === viewerTesterId),
      createdAt: run.createdAt,
    }

    if (!base.mine) {
      views.push(base)
      continue
    }

    views.push({
      ...base,
      body: run.body,
      reproducibility: run.reproducibility ?? null,
      context: run.context ?? null,
      attachments: run.attachments ?? [],
    })
  }

  return views
}

export interface SerializableComment {
  _id: unknown
  body: string
  visibleToTester: boolean
  authorUser: unknown
  authorTester: unknown
  createdAt: Date
}

export interface TesterCommentView {
  _id: string
  body: string
  author: 'me' | 'team'
  createdAt: Date
}

/**
 * Le fil d'un retour ne mêle que deux voix : son auteur et l'équipe. Les notes
 * internes restent internes, et le message d'un autre testeur n'a rien à faire
 * ici — il appartient à un fil auquel le lecteur n'a pas accès.
 */
export function serializeCommentsForTester(
  comments: SerializableComment[],
  viewerTesterId: string,
): TesterCommentView[] {
  const views: TesterCommentView[] = []

  for (const comment of comments) {
    if (!comment.visibleToTester) continue

    const isMine = comment.authorTester != null && String(comment.authorTester) === viewerTesterId
    const isTeam = comment.authorTester == null && comment.authorUser != null
    if (!isMine && !isTeam) continue

    views.push({
      _id: String(comment._id),
      body: comment.body,
      author: isMine ? 'me' : 'team',
      createdAt: comment.createdAt,
    })
  }

  return views
}
