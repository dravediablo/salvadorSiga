import type { ModoInstalacion } from '@/pwa/instalacion'

interface Props {
  modo: ModoInstalacion
  onInstalar: () => void
}

export function PanelInstalacion({ modo, onInstalar }: Props) {
  if (modo === 'instalada') return null

  return (
    <section className="seccion caja" aria-labelledby="instalar">
      <h2 id="instalar">Instalar la app</h2>

      {modo === 'boton' && (
        <>
          <p>Instálala para abrirla desde la pantalla de inicio, sin barra del navegador y sin conexión.</p>
          <button className="btn btn-p btn-b" type="button" onClick={onInstalar}>
            Instalar
          </button>
        </>
      )}

      {modo === 'ios_safari' && (
        <>
          <p>En iPhone se instala desde Safari, en tres pasos:</p>
          <ol className="pasos">
            <li>
              Toca el botón <strong>Compartir</strong> <IconoCompartir /> en la barra de Safari.
            </li>
            <li>
              Desliza hacia abajo y toca <strong>Agregar a inicio</strong>.
            </li>
            <li>
              Toca <strong>Agregar</strong>, arriba a la derecha. Abre la app desde el nuevo ícono.
            </li>
          </ol>
        </>
      )}

      {modo === 'ios_otro' && (
        <p>
          Este navegador no permite agregar la app a la pantalla de inicio. Copia el enlace, ábrelo en <strong>Safari</strong> y sigue
          las instrucciones que aparecerán ahí.
        </p>
      )}

      {modo === 'no_disponible' && (
        <p>
          Tu navegador no ofrece la instalación en este momento. En Android, abre el enlace en Chrome y busca la opción{' '}
          <strong>Instalar app</strong> en el menú ⋮. Si ya la instalaste, ábrela desde su ícono.
        </p>
      )}
    </section>
  )
}

function IconoCompartir() {
  return (
    <svg className="icono-compartir" viewBox="0 0 24 24" width="22" height="22" role="img" aria-label="ícono de Compartir">
      <path d="M12 3v12M12 3 8 7M12 3l4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
