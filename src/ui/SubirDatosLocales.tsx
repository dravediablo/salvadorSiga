import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { borrarBaseAntigua, hayBaseAntigua, idUsuarioConSesion, resumenBaseAntigua, subidaDeEstaCuentaConfirmada, subidaRegistradaDeEstaCuenta, subirDatosLocales } from '@/datos'
import { avisar, confirmar, conAviso } from './dialogos'

const CLAVE_AHORA_NO = 'sigatoka.migracion.ahora_no'

/**
 * Migración de la etapa sin servidor: el propietario sube las tablas (y, si quiere, los recorridos) capturados en este
 * celular antes de que hubiera cuentas. La base local antigua no se borra hasta que la subida se confirme sincronizada.
 */
export function SubirDatosLocales({ ranchoId }: { ranchoId: string }) {
  // Se vuelve a leer cuando cambian los datos de la cuenta (la cola y los ajustes) y después de cada acción.
  const [version, setVersion] = useState(0)
  const datos = useLiveQuery(
    async () => ({ hayAntigua: await hayBaseAntigua(), resumen: await resumenBaseAntigua(), subida: await subidaRegistradaDeEstaCuenta() }),
    [version],
  )
  const [incluir, setIncluir] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [ahoraNo, setAhoraNo] = useState(() => localStorage.getItem(CLAVE_AHORA_NO) === '1')
  const confirmada = useLiveQuery(() => subidaDeEstaCuentaConfirmada(), [], false)
  const leer = () => setVersion((v) => v + 1)

  if (!datos || !datos.hayAntigua) return null
  const { resumen, subida } = datos

  async function subir() {
    if (!idUsuarioConSesion) return
    setOcupado(true)
    try {
      const r = await subirDatosLocales({ ranchoId, usuarioId: idUsuarioConSesion, incluirRecorridos: incluir })
      avisar(`Se prepararon para subir ${r.tablas} tabla(s)${incluir ? ` y ${r.recorridos} recorrido(s)` : ''}.`)
      leer()
    } finally {
      setOcupado(false)
    }
  }

  if (subida && !confirmada) {
    return (
      <section className="seccion caja" aria-labelledby="migracion">
        <h2 id="migracion">Subiendo los datos de este celular…</h2>
        <p className="peq">Se están enviando a tu rancho. Cuando termine podrás borrar los datos de la etapa sin servidor.</p>
      </section>
    )
  }
  if (subida && confirmada) {
    return (
      <section className="seccion caja" aria-labelledby="migracion">
        <h2 id="migracion">Tus datos ya están en tu rancho</h2>
        <p className="peq">La subida se confirmó. Ya puedes borrar los datos de la etapa sin servidor que quedaron en este celular.</p>
        <button
          className="btn btn-x"
          type="button"
          onClick={() =>
            conAviso(
              (async () => {
                if (!(await confirmar('Se borran los datos que capturaste antes de tener cuenta. Ya están en tu rancho.', { titulo: '¿Borrar los datos de la etapa sin servidor?', aceptar: 'Borrar', peligro: true }))) return
                await borrarBaseAntigua()
                leer()
              })(),
            )
          }
        >
          Borrar los datos de la etapa sin servidor
        </button>
      </section>
    )
  }
  if (!resumen || ahoraNo) return null
  return (
    <section className="seccion caja" aria-labelledby="migracion">
      <h2 id="migracion">Subir los datos de este celular a tu rancho</h2>
      <p className="peq">
        Este celular tiene datos de antes de las cuentas: {resumen.tablas} tabla(s) y {resumen.recorridos} recorrido(s). Las tablas se copian a tu rancho con su polígono, superficie y variedad.
      </p>
      <label className="interruptor" style={{ display: 'flex' }}>
        <input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} />
        También subir los recorridos ({resumen.recorridos}) con sus plantas y hojas, a tu nombre
      </label>
      <div className="fila-btn" style={{ marginTop: 10 }}>
        <button
          className="btn"
          type="button"
          onClick={() => {
            localStorage.setItem(CLAVE_AHORA_NO, '1')
            setAhoraNo(true)
          }}
        >
          Ahora no
        </button>
        <button className="btn btn-p" type="button" disabled={ocupado} onClick={() => void subir()}>
          {ocupado ? 'Preparando…' : 'Subir a mi rancho'}
        </button>
      </div>
    </section>
  )
}
