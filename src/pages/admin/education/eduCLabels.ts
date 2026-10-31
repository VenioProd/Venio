/**
 * Clés de traduction des libellés d'énumérations de l'espace éducation (classes, devoirs, rendus).
 * Les valeurs d'énumération restent celles de l'API : seul l'affichage passe par ces tables.
 */
import type { MessageKey } from '../../../i18n'
import type {
  EducationClassStatus,
  EducationAssignmentStatus,
  EducationAssignmentKind,
  EducationSubmissionStatus,
} from '../../../services/education'

export const CLASS_STATUS_KEYS: Record<EducationClassStatus, MessageKey> = {
  ACTIVE: 'eduC.classStatus.active',
  PAUSE: 'eduC.classStatus.paused',
  TERMINE: 'eduC.classStatus.finished',
  ARCHIVE: 'eduC.classStatus.archived',
}

export const ASSIGNMENT_STATUS_KEYS: Record<EducationAssignmentStatus, MessageKey> = {
  DRAFT: 'eduC.assignmentStatus.draft',
  OUVERT: 'eduC.assignmentStatus.open',
  EN_CORRECTION: 'eduC.assignmentStatus.grading',
  CLOS: 'eduC.assignmentStatus.closed',
  ARCHIVE: 'eduC.assignmentStatus.archived',
}

export const ASSIGNMENT_KIND_KEYS: Record<EducationAssignmentKind, MessageKey> = {
  DEVOIR: 'eduC.assignmentKind.assignment',
  PROJET: 'eduC.assignmentKind.project',
  EXPOSE: 'eduC.assignmentKind.presentation',
  QCM: 'eduC.assignmentKind.quiz',
  EXAMEN: 'eduC.assignmentKind.exam',
  AUTRE: 'eduC.assignmentKind.other',
}

export const SUBMISSION_STATUS_KEYS: Record<EducationSubmissionStatus, MessageKey> = {
  NON_RENDU: 'eduC.submissionStatus.notSubmitted',
  EN_RETARD: 'eduC.submissionStatus.late',
  RENDU: 'eduC.submissionStatus.submitted',
  EN_CORRECTION: 'eduC.submissionStatus.grading',
  CORRIGE: 'eduC.submissionStatus.graded',
  NON_VALIDE: 'eduC.submissionStatus.notValidated',
}
