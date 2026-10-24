/* Démonstration FR/EN (docs/apps-natives/langues.md). À charger dans <head> avant theme-panel.js :
   <script src="../locale-demo.js" data-translate="page"></script>
   Sans data-translate, le script ne gère que l'état (feuille Réglages du Mac) et ne touche pas au texte de la page.
   Stockage : { locale: 'system' | 'fr' | 'en', autoTranslate: boolean }. */
(function () {
  var KEY = 'venio-locale'
  var script = document.currentScript
  var translatePage = !!(script && script.getAttribute('data-translate'))
  var listeners = []

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) } catch (e) { return null } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch (e) {} }

  var saved = read()
  var state = {
    locale: saved && /^(system|fr|en)$/.test(saved.locale) ? saved.locale : 'system',
    autoTranslate: saved && typeof saved.autoTranslate === 'boolean' ? saved.autoTranslate : true
  }
  var q = new URLSearchParams(location.search).get('lang')
  if (q === 'fr' || q === 'en') state.locale = q

  function lang() {
    if (state.locale !== 'system') return state.locale
    return /^en/i.test(navigator.language || '') ? 'en' : 'fr'
  }
  function get() { return { locale: state.locale, lang: lang(), autoTranslate: state.autoTranslate } }
  function set(patch) {
    if (patch && /^(system|fr|en)$/.test(patch.locale)) state.locale = patch.locale
    if (patch && typeof patch.autoTranslate === 'boolean') state.autoTranslate = patch.autoTranslate
    write(state)
    Array.prototype.forEach.call(document.querySelectorAll('[data-flip]'), function (el) { el.removeAttribute('data-flip') })
    render()
    listeners.forEach(function (fn) { fn(get()) })
  }
  window.VenioLocale = { get: get, set: set, onChange: function (fn) { listeners.push(fn) } }

  /* ---------- traduction de la page (libellés, titres, dates, montants) ---------- */
  var DICT = {
    'Accueil': 'Home', 'Aujourd’hui': 'Today', "Aujourd'hui": 'Today', 'Projets': 'Projects', 'Devis': 'Quotes', 'Chiffres': 'Stats',
    'Fiche lead': 'Lead', 'Nouveau lead': 'New lead', 'Nouveau devis': 'New quote', 'Fiche projet': 'Project',
    'Réglages': 'Settings', 'Apparence': 'Appearance', 'Langue': 'Language', 'Annuler': 'Cancel', 'Créer': 'Create', 'Brouillon': 'Draft',
    'Aperçu': 'Preview', 'Thème': 'Theme', 'Fond': 'Background', 'Aperçu en direct': 'Live preview', 'Lecture seule': 'Read only',
    'Bonjour, Léa': 'Hello, Léa', 'En retard': 'Overdue', 'Relances du jour': 'Follow-ups today', 'RDV du jour': 'Meetings today',
    'Devis vu, pas signé': 'Quote viewed, not signed', 'Lead chaud sans action': 'Hot lead, no action', 'Nouveau lead entrant': 'New inbound lead',
    'Relances': 'Follow-ups', 'Agenda du jour': 'Today’s agenda', 'À débloquer': 'To unblock', 'Entrant': 'Inbound', 'Non assigné': 'Unassigned',
    'Mes leads': 'My leads', 'Tous': 'All', 'Valeur totale': 'Total value', 'Valeur pondérée': 'Weighted value', 'Pondéré': 'Weighted',
    'Timeline': 'Timeline', 'Montant': 'Amount', 'Probabilité': 'Probability', 'Assignée à': 'Assigned to', 'Très chaud': 'Very hot', 'Chaud': 'Hot',
    'Appeler': 'Call', 'Relance': 'Follow-up', 'Étape': 'Stage', 'Planifier': 'Schedule', 'Relancer': 'Chase',
    'Lead': 'Lead', 'Qualifié': 'Qualified', 'Contacté': 'Contacted', 'Démo': 'Demo', 'Proposition': 'Proposal', 'Gagné': 'Won',
    'Modèle': 'Template', 'Destinataire': 'Recipient', 'Total HT': 'Total excl. tax', 'Total TTC': 'Total incl. tax', 'TVA 20 %': 'VAT 20%',
    'Envoyé': 'Sent', 'Vu': 'Viewed', 'Budget': 'Budget', 'Facturé': 'Invoiced', 'Demandes et tickets': 'Requests and tickets',
    'Fil des mises à jour client': 'Client update feed', 'Phase en cours': 'Current phase', 'Cadrage': 'Scoping', 'Conception': 'Design',
    'Langue de l’interface': 'Interface language', 'Système': 'System', 'Français': 'French', 'Traduire automatiquement': 'Translate automatically',
    'Réglages · Apparence': 'Settings · Appearance', 'Réglages · Langue': 'Settings · Language',
    'Les notes, messages et mises à jour écrits dans l\'autre langue s\'affichent traduits. La traduction se fait sur l\'appareil.': 'Notes, messages and updates written in the other language are shown translated. Translation happens on the device.',
    'Développement': 'Development', 'Recette': 'Acceptance', 'Mise en ligne': 'Go-live', 'Saisie': 'Entry', 'Voix': 'Voice', 'Carte': 'Card'
  }
  var TITLE_PREFIX = /^(\d\d) · (.+)$/
  var MONTHS = { 'oct.': ['Oct', 'October'], 'nov.': ['Nov', 'November'], 'octobre': ['Oct', 'October'], 'novembre': ['Nov', 'November'] }
  var DAYS = { 'lun.': 'Mon', 'mar.': 'Tue', 'mer.': 'Wed', 'jeu.': 'Thu', 'ven.': 'Fri', 'sam.': 'Sat', 'dim.': 'Sun',
    'Lundi': 'Monday', 'Mardi': 'Tuesday', 'Mercredi': 'Wednesday', 'Jeudi': 'Thursday', 'Vendredi': 'Friday', 'Samedi': 'Saturday', 'Dimanche': 'Sunday' }
  var SP = '[\\s\\u00a0\\u202f]'

  function translate(s) {
    var t = s.trim()
    if (!t) return s
    var lead = s.slice(0, s.indexOf(t)), tail = s.slice(s.indexOf(t) + t.length)
    var m = TITLE_PREFIX.exec(t)
    if (m && DICT[m[2]]) return lead + m[1] + ' · ' + DICT[m[2]] + tail
    if (DICT[t]) return lead + DICT[t] + tail
    t = t
      // « Ven. 23 octobre », « Vendredi 23 octobre », « mar. 27 oct. », « 28 nov. 2026 »
      .replace(new RegExp('(?:(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche|[Ll]un\\.|[Mm]ar\\.|[Mm]er\\.|[Jj]eu\\.|[Vv]en\\.|[Ss]am\\.|[Dd]im\\.)' + SP + ')?(\\d{1,2})' + SP + '(oct\\.|nov\\.|octobre|novembre)(' + SP + '(20\\d\\d))?', 'gi'),
        function (_, d, n, mo, _y, y) {
          mo = mo.toLowerCase()
          var long = mo.length > 4
          var dd = d ? (DAYS[d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()] || DAYS[d.toLowerCase()] || d) + (long ? ', ' : ' ') : ''
          return dd + MONTHS[mo][long ? 1 : 0] + ' ' + n + (y ? ', ' + y : '')
        })
      // montants : « 14 800 € » → « €14,800 »
      .replace(new RegExp('(\\d{1,3}(?:' + SP + '\\d{3})*)' + SP + '€', 'g'), function (_, n) { return '€' + n.replace(new RegExp(SP, 'g'), ',') })
      .replace(new RegExp('(\\d+)' + SP + '%', 'g'), '$1%')
      .replace(/(\d),(\d) s\b/g, '$1.$2 s')
      .replace(/\bpond\./g, 'wtd.')
    return lead + t + tail
  }

  var originals = new WeakMap()
  var SKIP = 'script,style,.vtp,[data-no-i18n]'
  function walk(toEnglish) {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    var n
    while ((n = w.nextNode())) {
      if (n.parentElement && n.parentElement.closest(SKIP)) continue
      if (!originals.has(n)) originals.set(n, n.nodeValue)
      var o = originals.get(n)
      var next = toEnglish ? translate(o) : o
      if (n.nodeValue !== next) n.nodeValue = next
    }
  }

  /* ---------- note traduite : <div data-tn data-lang="en" data-text-en="…" data-text-fr="…"> avec .tn-text et .tn-flag ---------- */
  var LABELS = {
    fr: { translated: 'Traduit · voir l’original', original: 'Original · voir la traduction', translate: 'Traduire' },
    en: { translated: 'Translated · see original', original: 'Original · see translation', translate: 'Translate' }
  }
  function renderNote(el) {
    var ui = lang(), src = el.getAttribute('data-lang')
    var text = el.querySelector('.tn-text'), flag = el.querySelector('.tn-flag')
    if (!text || !flag) return
    if (src === ui) { text.textContent = el.getAttribute('data-text-' + src); flag.hidden = true; el.removeAttribute('data-translated'); return }
    // Traduction automatique : on voit la traduction, un geste ramène l'original. Désactivée : l'inverse.
    var translated = state.autoTranslate !== el.hasAttribute('data-flip')
    text.textContent = el.getAttribute('data-text-' + (translated ? ui : src))
    flag.hidden = false
    flag.textContent = LABELS[ui][translated ? 'translated' : state.autoTranslate ? 'original' : 'translate']
    if (translated) el.setAttribute('data-translated', ''); else el.removeAttribute('data-translated')
  }
  function bindNotes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tn]'), function (el) {
      var flag = el.querySelector('.tn-flag')
      if (flag && !flag.__bound) {
        flag.__bound = true
        flag.addEventListener('click', function () {
          if (el.hasAttribute('data-flip')) el.removeAttribute('data-flip'); else el.setAttribute('data-flip', '')
          renderNote(el)
        })
      }
    })
  }

  function render() {
    document.documentElement.setAttribute('lang', lang())
    if (translatePage && document.body) {
      walk(lang() === 'en')
      bindNotes()
      Array.prototype.forEach.call(document.querySelectorAll('[data-tn]'), renderNote)
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render)
  else render()
  window.addEventListener('load', render)
})()
