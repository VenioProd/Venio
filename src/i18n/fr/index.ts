// Chargé avec l'application : site public, coque et libellés partagés.
import common from './common'
import pubHome from './pubHome'
import pubForms from './pubForms'
import shell from './shell'
import shared from './shared'

const messages = {
  ...common,
  ...pubHome,
  ...pubForms,
  ...shell,
  ...shared,
}

export default messages
