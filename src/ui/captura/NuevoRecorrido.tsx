import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, repos } from '@/datos'
import { hoy, ordenarTablas, semanaISO } from '@/dominio'
import { enSegundoPlano } from '../dialogos'
import { etiquetaSemana } from '../formato'
import type { Nav } from '../navegacion'
import { Migas, SelectorTablas } from './componentes'

interface Props {
  ranchoId: string
  usuarioId: string
  operador: string
  ir: (n: Nav) => void
}

export function NuevoRecorrido({ ranchoId, usuarioId, operador, ir }: Props) {
  const todas = useLiveQuery(() => consultas.tablas(), [])
  const [fecha, setFecha] = useState(hoy())
  const [sel, setSel] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)
  const tablas = (todas ?? []).filter((t) => t.activa)

  async function iniciar() {
    setOcupado(true)
    try {
      const ordenadas = ordenarTablas(tablas.filter((t) => sel.includes(t.id)))
      const { recorrido } = await repos.recorridos.crear({ rancho_id: ranchoId, fecha, usuario_id: usuarioId, tabla_ids: ordenadas.map((t) => t.id) })
      ir({ vista: 'recorrido', recorridoId: recorrido.id })
    } catch (e) {
      setOcupado(false)
      enSegundoPlano(Promise.reject(e))
    }
  }

  return (
    <div>
      <Migas onVolver={() => ir({ vista: 'lista' })}>Recorridos</Migas>
      <h1>Nuevo recorrido</h1>
      <label className="campo">
        <span>Fecha</span>
        <input className="inp" type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value || hoy())} />
      </label>
      <p className="peq muted">
        Semana {etiquetaSemana(semanaISO(fecha))}, operador: {operador}
      </p>
      <h2 style={{ margin: '18px 0 6px' }}>Tablas a evaluar</h2>
      <p className="peq muted">Elige una o varias. Puedes agregar más durante el recorrido.</p>
      {todas && tablas.length === 0 ? (
        <div className="aviso">No hay tablas activas. Pide al administrador que active o importe las tablas del rancho.</div>
      ) : (
        <SelectorTablas tablas={tablas} sel={sel} onCambio={setSel} />
      )}
      <div className="fila-btn" style={{ marginTop: 10 }}>
        <button className="enlace" type="button" onClick={() => setSel(sel.length === tablas.length ? [] : tablas.map((t) => t.id))}>
          {sel.length === tablas.length && tablas.length > 0 ? 'Quitar todas' : 'Seleccionar todas'}
        </button>
      </div>
      <button className="btn btn-p btn-b" type="button" style={{ marginTop: 18 }} disabled={!sel.length || ocupado} onClick={() => void iniciar()}>
        Iniciar recorrido{sel.length ? ` (${sel.length} tabla${sel.length > 1 ? 's' : ''})` : ''}
      </button>
    </div>
  )
}
