import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/ui/App'
import { registrarServiceWorker } from '@/pwa/actualizacion'
import '@/pwa/instalacion' // captura beforeinstallprompt antes de que monte React
import '@/ui/estilos.css'

registrarServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
