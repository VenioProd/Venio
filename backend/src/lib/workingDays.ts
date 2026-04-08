/**
 * Count the number of "working days" (jours de présence) between two dates.
 * Does not count the start date itself, counts up to and including the end date.
 *
 * @param from  - start date (e.g. last report date)
 * @param to    - end date (e.g. today)
 * @param jours - array of French day names the intern works (e.g. ['lundi', 'mercredi'])
 */
const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export function countWorkingDaysSince(from: Date, to: Date, jours: string[]): number {
  const workDays = jours.length > 0 ? jours : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
  let count = 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() + 1) // start from day after last report

  const end = new Date(to)
  end.setHours(23, 59, 59, 999)

  while (cursor <= end) {
    const dayName = DAY_NAMES[cursor.getDay()]
    if (workDays.includes(dayName)) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
