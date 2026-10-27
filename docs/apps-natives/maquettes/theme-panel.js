/* Prévisualisation des thèmes : applique data-bg / data-accent sur <html>, mémorise le choix
   et affiche un panneau flottant. À charger dans <head>, sans defer :
   <script src="../theme-panel.js" data-track="glass"></script>   (ou "neon")
   Valeurs : docs/apps-natives/themes.md. Stockage : { theme, background, accent }. */
(function () {
  var KEY = 'venio-theme'
  var TRACKS = {
    glass: {
      label: 'Liquid glass', dir: 'liquid-glass',
      backgrounds: [
        { key: 'mist', label: 'Brume', css: 'linear-gradient(135deg,#BAE6FD,#EEF3F8 55%,#DDD6FE)' },
        { key: 'dawn', label: 'Aurore', css: 'linear-gradient(135deg,#FECDD3,#FBF1EC 55%,#FDE68A)' },
        { key: 'lagoon', label: 'Lagune', css: 'linear-gradient(135deg,#99F6E4,#ECF7F5 55%,#BAE6FD)' },
        { key: 'lavender', label: 'Lavande', css: 'linear-gradient(135deg,#DDD6FE,#F3F0FA 55%,#FBCFE8)' },
        { key: 'night', label: 'Nuit', css: 'linear-gradient(135deg,#1E3A8A,#0B1220 55%,#4C1D95)' }
      ],
      accents: [
        { key: 'sky', label: 'Sky Venio', css: '#0EA5E9' }, { key: 'violet', label: 'Violet', css: '#7C3AED' },
        { key: 'mint', label: 'Menthe', css: '#10B981' }, { key: 'coral', label: 'Corail', css: '#F97362' },
        { key: 'amber', label: 'Ambre', css: '#F59E0B' }
      ]
    },
    neon: {
      label: 'Néon', dir: 'neon',
      backgrounds: [
        { key: 'black', label: 'Noir', css: 'linear-gradient(135deg,#14171C,#050505 60%,#0D0F12)' },
        { key: 'graphite', label: 'Graphite', css: 'linear-gradient(135deg,#1F2630,#0D1117 60%,#161B22)' },
        { key: 'abyss', label: 'Abysse', css: 'linear-gradient(135deg,#112840,#04121F 60%,#0A1D30)' },
        { key: 'plum', label: 'Aubergine', css: 'linear-gradient(135deg,#26163A,#12071C 60%,#1C0F2A)' },
        { key: 'forest', label: 'Forêt', css: 'linear-gradient(135deg,#112B22,#03130E 60%,#0A1F18)' }
      ],
      accents: [
        { key: 'cyan', label: 'Cyan Venio', css: '#0EA5E9' }, { key: 'magenta', label: 'Magenta', css: '#FF0080' },
        { key: 'violet', label: 'Violet', css: '#A855F7' }, { key: 'acid', label: 'Vert acide', css: '#39FF88' },
        { key: 'orange', label: 'Orange', css: '#FF7A1A' }
      ]
    }
  }

  var script = document.currentScript
  var track = (script && script.getAttribute('data-track')) === 'neon' ? 'neon' : 'glass'
  var other = track === 'glass' ? 'neon' : 'glass'
  var root = document.documentElement
  var listeners = []

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) } catch (e) { return null }
  }
  function write(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)) } catch (e) {}
  }
  function indexOfKey(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return i
    return -1
  }
  // Un choix venant de l'autre piste est transposé par position (les deux listes de 5 sont parallèles).
  function convert(v, to) {
    var from = TRACKS[v.theme] ? v.theme : to
    if (from === to) return v
    var bi = indexOfKey(TRACKS[from].backgrounds, v.background)
    var ai = indexOfKey(TRACKS[from].accents, v.accent)
    return {
      theme: to,
      background: TRACKS[to].backgrounds[Math.max(bi, 0)].key,
      accent: TRACKS[to].accents[Math.max(ai, 0)].key
    }
  }
  function valid(v) {
    return v && indexOfKey(TRACKS[track].backgrounds, v.background) >= 0 && indexOfKey(TRACKS[track].accents, v.accent) >= 0
  }

  var current = (function () {
    var v = read()
    v = v && v.theme ? convert(v, track) : null
    if (!valid(v)) v = { theme: track, background: TRACKS[track].backgrounds[0].key, accent: TRACKS[track].accents[0].key }
    // ?bg=…&accent=… force un choix (liens de démonstration, captures).
    var q = new URLSearchParams(location.search)
    if (indexOfKey(TRACKS[track].backgrounds, q.get('bg')) >= 0) v.background = q.get('bg')
    if (indexOfKey(TRACKS[track].accents, q.get('accent')) >= 0) v.accent = q.get('accent')
    return v
  })()

  function apply() {
    root.setAttribute('data-bg', current.background)
    root.setAttribute('data-accent', current.accent)
    root.setAttribute('data-theme', track)
  }
  function set(patch) {
    var next = { theme: track, background: current.background, accent: current.accent }
    if (patch && patch.background && indexOfKey(TRACKS[track].backgrounds, patch.background) >= 0) next.background = patch.background
    if (patch && patch.accent && indexOfKey(TRACKS[track].accents, patch.accent) >= 0) next.accent = patch.accent
    current = next
    apply()
    write(current)
    sync()
    listeners.forEach(function (fn) { fn(current) })
  }

  apply()
  write(current)
  window.VenioTheme = {
    track: track,
    tracks: TRACKS,
    get: function () { return { theme: current.theme, background: current.background, accent: current.accent } },
    set: set,
    onChange: function (fn) { listeners.push(fn) },
    // Ouvre la même page dans l'autre piste, avec le choix courant transposé.
    switchTo: function (theme) {
      if (!TRACKS[theme] || theme === track) return
      write(convert(current, theme))
      location.href = '../' + TRACKS[theme].dir + '/' + (location.pathname.split('/').pop() || 'index.html') + location.hash
    }
  }

  /* ---------- panneau ---------- */
  var panel, toggle
  function sync() {
    if (!panel) return
    Array.prototype.forEach.call(panel.querySelectorAll('[data-k]'), function (b) {
      b.setAttribute('aria-pressed', String(current[b.getAttribute('data-g')] === b.getAttribute('data-k')))
    })
    var t = TRACKS[track]
    panel.querySelector('[data-name]').textContent =
      t.backgrounds[indexOfKey(t.backgrounds, current.background)].label + ' · ' + t.accents[indexOfKey(t.accents, current.accent)].label
  }
  function swatches(group, list) {
    return list.map(function (o) {
      return '<button type="button" data-g="' + group + '" data-k="' + o.key + '" title="' + o.label + '" aria-label="' + o.label +
        '" aria-pressed="false" style="background:' + o.css + '"></button>'
    }).join('')
  }
  function build() {
    var t = TRACKS[track]
    var page = location.pathname.split('/').pop() || 'index.html'
    var style = document.createElement('style')
    style.textContent =
      '.vtp,.vtp *{box-sizing:border-box;font:600 11px/1.2 -apple-system,"SF Pro Text",Inter,system-ui,sans-serif;letter-spacing:0;text-transform:none;text-shadow:none}' +
      '.vtp{position:fixed;right:12px;bottom:12px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:calc(100vw - 24px);color:#F4F6FB}' +
      '.vtp-tg{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.28);background:rgba(16,20,32,.82);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);cursor:pointer;display:grid;place-items:center;box-shadow:0 6px 20px rgba(0,0,0,.35)}' +
      '.vtp-tg i{width:18px;height:18px;border-radius:50%;background:conic-gradient(#0EA5E9,#8B5CF6,#FF0080,#F59E0B,#10B981,#0EA5E9);border:2px solid #fff}' +
      '.vtp-box{width:236px;max-width:100%;padding:12px;border-radius:16px;border:1px solid rgba(255,255,255,.22);background:rgba(16,20,32,.88);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:0 14px 40px rgba(0,0,0,.4);display:none}' +
      '.vtp.open .vtp-box{display:block}' +
      '.vtp h4{margin:10px 0 6px;font-size:10px;opacity:.65;letter-spacing:.08em;text-transform:uppercase}.vtp h4:first-child{margin-top:0}' +
      '.vtp-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;border-radius:10px;background:rgba(255,255,255,.1)}' +
      '.vtp-seg a,.vtp-seg button{padding:6px 4px;border:0;border-radius:8px;text-align:center;color:inherit;text-decoration:none;opacity:.8;background:none;cursor:pointer}.vtp-seg a[aria-current],.vtp-seg button[aria-pressed=true]{background:#fff;color:#0D1424;opacity:1}' +
      '.vtp-row{display:flex;gap:8px}' +
      '.vtp-row button{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.35);padding:0;cursor:pointer}' +
      '.vtp-row button[aria-pressed=true]{border-color:#fff;box-shadow:0 0 0 2px rgba(16,20,32,.9),0 0 0 4px #fff}' +
      '.vtp-name{margin-top:10px;opacity:.7;font-weight:500}'
    document.head.appendChild(style)

    panel = document.createElement('div')
    panel.className = 'vtp'
    panel.innerHTML =
      '<div class="vtp-box" role="group" aria-label="Aperçu du thème">' +
        '<h4>Thème</h4><div class="vtp-seg">' +
          '<a href="' + (track === 'glass' ? '#' : '../liquid-glass/' + page) + '" data-to="glass"' + (track === 'glass' ? ' aria-current="page"' : '') + '>Liquid glass</a>' +
          '<a href="' + (track === 'neon' ? '#' : '../neon/' + page) + '" data-to="neon"' + (track === 'neon' ? ' aria-current="page"' : '') + '>Néon</a>' +
        '</div>' +
        '<h4>Fond</h4><div class="vtp-row">' + swatches('background', t.backgrounds) + '</div>' +
        '<h4>Accent</h4><div class="vtp-row">' + swatches('accent', t.accents) + '</div>' +
        (window.VenioLocale ? '<h4>Langue</h4><div class="vtp-seg"><button type="button" data-loc="fr" aria-pressed="false">FR</button><button type="button" data-loc="en" aria-pressed="false">EN</button></div>' : '') +
        '<div class="vtp-name" data-name></div>' +
      '</div>' +
      '<button type="button" class="vtp-tg" aria-label="Aperçu du thème" aria-expanded="false"><i></i></button>'
    document.body.appendChild(panel)

    toggle = panel.querySelector('.vtp-tg')
    toggle.addEventListener('click', function () {
      var open = panel.classList.toggle('open')
      toggle.setAttribute('aria-expanded', String(open))
    })
    panel.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-k]') : null
      if (b) set((function (o) { o[b.getAttribute('data-g')] = b.getAttribute('data-k'); return o })({}))
    })
    if (window.VenioLocale) {
      var syncLoc = function () {
        Array.prototype.forEach.call(panel.querySelectorAll('[data-loc]'), function (b) {
          b.setAttribute('aria-pressed', String(window.VenioLocale.get().lang === b.getAttribute('data-loc')))
        })
      }
      panel.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-loc]') : null
        if (b) window.VenioLocale.set({ locale: b.getAttribute('data-loc') })
      })
      window.VenioLocale.onChange(syncLoc)
      syncLoc()
    }
    // Le lien vers l'autre piste emporte le choix courant, transposé par position.
    panel.querySelector('[data-to=' + other + ']').addEventListener('click', function () {
      write(convert(current, other))
    })
    sync()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build)
  else build()
})()
