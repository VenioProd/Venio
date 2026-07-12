import { NotificationProvider } from '../context/NotificationContext'
import Navbar from './Navbar'

const AuthenticatedPublicHeader = () => (
  <NotificationProvider>
    <Navbar />
  </NotificationProvider>
)

export default AuthenticatedPublicHeader
