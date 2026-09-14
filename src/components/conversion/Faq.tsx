import './Faq.css'
import type { FaqItem } from '../../content/faq'

interface FaqProps {
  items: FaqItem[]
  /** Titre de section. Jamais un h1 : les pages publiques n'en tolèrent qu'un. */
  title?: string
}

/**
 * Accordéon natif `<details>`/`<summary>` : il s'ouvre sans JavaScript, le
 * clavier et les lecteurs d'écran le connaissent déjà, et le résumé porte son
 * propre nom accessible — là où un `<button>` maison devrait le déclarer.
 *
 * Le contenu vient de `src/content/faq.ts`, qui alimente aussi le JSON-LD
 * `FAQPage`. Les questions sont des `h3` : une page publique n'a qu'un `h1`.
 */
const Faq = ({ items, title = 'Les questions qu’on nous pose' }: FaqProps) => {
  return (
    <div className="mc-faq">
      <header className="mc-faq-head">
        <p className="mc-eyebrow">Questions fréquentes</p>
        <h2 className="mc-faq-title">{title}</h2>
      </header>

      <div className="mc-faq-list">
        {items.map((item) => (
          <details key={item.question} className="mc-card mc-faq-item">
            <summary className="mc-faq-q">
              <h3 className="mc-faq-q-text">
                <span>{item.question}</span>
                <span className="mc-faq-sign" aria-hidden="true" />
              </h3>
            </summary>
            <p className="mc-faq-a">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

export default Faq
