/**
 * Charge jsPDF uniquement lorsque l'utilisateur demande un export.
 * html2canvas reste une dépendance asynchrone de jsPDF et n'est donc chargé
 * que par les fonctionnalités de rendu HTML qui l'utilisent.
 */
export async function loadJsPdf() {
  const { jsPDF } = await import('jspdf')
  return jsPDF
}
