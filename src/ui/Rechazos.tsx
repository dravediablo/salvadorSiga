import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, mensajeDeError, motor } from '@/datos'
import { avisar, conAviso } from './dialogos'

/** Cambios que el servidor rechazó: se ven con su motivo hasta que la persona los descarta o los vuelve a editar. */
export function Rechazos() {
  const lista = useLiveQuery(() => consultas.rechazos(), [])
  if (!lista?.length) return null
  return (
    <section className="seccion" aria-labelledby="rechazos">
      <h2 id="rechazos">Cambios rechazados por el servidor ({lista.length})</h2>
      <p className="peq">
        Estos cambios no se enviarán solos. Tu captura sigue en este dispositivo. Si vuelves a editar el registro, se intenta de nuevo; si no, descarta tu cambio para traer la versión del servidor.
      </p>
      <ul className="lista-rechazos">
        {lista.map(({ rechazo, descripcion }) => (
          <li key={`${rechazo.entidad}:${rechazo.registro_id}`} className="caja">
            <b>{descripcion}</b>
            <div className="error" role="note">
              {rechazo.motivo}
            </div>
            <button
              className="btn btn-s"
              type="button"
              onClick={() =>
                conAviso(
                  motor
                    .descartarRechazo(rechazo)
                    .then(() => avisar('Se trajo la versión del servidor.'))
                    .catch((e: unknown) => {
                      throw new Error(`No se pudo traer la versión del servidor (${mensajeDeError(e)}) Revisa tu conexión e inténtalo de nuevo.`)
                    }),
                )
              }
            >
              Descartar mi cambio
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
