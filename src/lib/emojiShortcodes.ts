/**
 * Map de shortcodes émoji → caractère unicode.
 * Sous-ensemble pragmatique des plus utilisés en communication pro.
 * Tapé par l'utilisateur sous la forme `:shortcode:` ou détecté en frappe via `:short`.
 */
export const EMOJI_SHORTCODES: Record<string, string> = {
  // Visages — joyeux
  smile: '😀',
  grinning: '😁',
  laughing: '😆',
  joy: '😂',
  rofl: '🤣',
  blush: '😊',
  smiling: '🙂',
  wink: '😉',
  heart_eyes: '😍',
  kissing_heart: '😘',
  sweat_smile: '😅',
  innocent: '😇',
  cool: '😎',
  party: '🥳',
  star_struck: '🤩',

  // Visages — neutres / négatifs
  thinking: '🤔',
  neutral: '😐',
  expressionless: '😑',
  unamused: '😒',
  rolling_eyes: '🙄',
  flushed: '😳',
  worried: '😟',
  pensive: '😔',
  confused: '😕',
  cry: '😢',
  sob: '😭',
  sleepy: '😪',
  sleeping: '😴',
  yawning: '🥱',
  weary: '😩',
  tired: '😫',
  angry: '😠',
  rage: '😡',
  triumph: '😤',
  scream: '😱',
  fear: '😨',
  cold_sweat: '😰',
  mind_blown: '🤯',
  exploding_head: '🤯',
  vomit: '🤮',
  sick: '🤒',
  mask: '😷',

  // Autres visages
  ghost: '👻',
  skull: '💀',
  alien: '👽',
  robot: '🤖',
  clown: '🤡',
  poop: '💩',

  // Cœurs
  heart: '❤️',
  orange_heart: '🧡',
  yellow_heart: '💛',
  green_heart: '💚',
  blue_heart: '💙',
  purple_heart: '💜',
  black_heart: '🖤',
  white_heart: '🤍',
  broken_heart: '💔',
  sparkling_heart: '💖',
  two_hearts: '💕',
  cupid: '💘',

  // Symboles / effets
  fire: '🔥',
  star: '⭐',
  sparkles: '✨',
  boom: '💥',
  zap: '⚡',
  '100': '💯',
  warning: '⚠️',
  check: '✅',
  white_check: '☑️',
  x: '❌',
  no_entry: '⛔',
  question: '❓',
  exclamation: '❗',
  bangbang: '‼️',

  // Mains / gestes
  thumbsup: '👍',
  '+1': '👍',
  thumbsdown: '👎',
  '-1': '👎',
  ok_hand: '👌',
  clap: '👏',
  pray: '🙏',
  raised_hands: '🙌',
  muscle: '💪',
  wave: '👋',
  point_up: '☝️',
  point_right: '👉',
  point_left: '👈',
  point_down: '👇',
  fist: '✊',
  handshake: '🤝',
  crossed_fingers: '🤞',
  call_me: '🤙',

  // Corps
  eyes: '👀',
  brain: '🧠',
  ear: '👂',

  // Travail / pro
  rocket: '🚀',
  tada: '🎉',
  gift: '🎁',
  trophy: '🏆',
  bulb: '💡',
  computer: '💻',
  laptop: '💻',
  phone: '📱',
  mail: '📧',
  envelope: '✉️',
  inbox: '📥',
  outbox: '📤',
  memo: '📝',
  pencil: '✏️',
  chart_up: '📈',
  chart_down: '📉',
  bar_chart: '📊',
  calendar: '📅',
  clock: '⏰',
  hourglass: '⏳',
  lock: '🔒',
  unlock: '🔓',
  key: '🔑',
  bell: '🔔',
  mute: '🔕',
  link: '🔗',
  paperclip: '📎',
  pushpin: '📌',
  bookmark: '🔖',
  magnifier: '🔍',
  gear: '⚙️',
  wrench: '🔧',
  hammer: '🔨',

  // Nature / nourriture
  sun: '☀️',
  moon: '🌙',
  cloud: '☁️',
  rain: '🌧️',
  snow: '❄️',
  rainbow: '🌈',
  earth: '🌍',
  cake: '🎂',
  birthday: '🎂',
  coffee: '☕',
  tea: '🍵',
  beer: '🍺',
  wine: '🍷',
  cocktail: '🍸',
  pizza: '🍕',
  burger: '🍔',
  fries: '🍟',
  apple: '🍎',
  croissant: '🥐',
}

export interface EmojiSuggestion {
  shortcode: string
  emoji: string
}

const ALL_ENTRIES: EmojiSuggestion[] = Object.entries(EMOJI_SHORTCODES).map(
  ([shortcode, emoji]) => ({ shortcode, emoji })
)

/**
 * Retourne les suggestions correspondant au préfixe tapé (ex: "sm" → smile, smiling).
 * Privilégie les matches qui commencent par le préfixe, puis ceux qui le contiennent.
 */
export function getEmojiSuggestions(prefix: string, limit = 8): EmojiSuggestion[] {
  const normalized = prefix.toLowerCase().trim()
  if (!normalized) return ALL_ENTRIES.slice(0, limit)

  const startsWith: EmojiSuggestion[] = []
  const contains: EmojiSuggestion[] = []
  for (const entry of ALL_ENTRIES) {
    if (entry.shortcode.startsWith(normalized)) startsWith.push(entry)
    else if (entry.shortcode.includes(normalized)) contains.push(entry)
    if (startsWith.length >= limit) break
  }
  return [...startsWith, ...contains].slice(0, limit)
}
