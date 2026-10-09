import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, hayFallos, repos } from '@/datos'
import {
  ordenarTablas, puedeCerrarRecorrido, puedeEditarRecorrido, puedeEliminarRecorrido, puedeReabrirRecorrido, resumen, completa, type ActorPermisos,
} from '@/dominio'
import { avisar, confirmar, conAviso } from '../dialogos'
import { useFallos } from '../useFallos'
import { etiquetaSemana, fechaSinAnio, fmt } from '../formato'
import type { Nav } from '../navegacion'
import { EtqEstado, Faltante, Migas, SelectorTablas } from './componentes'

interface Props {
  actor: ActorPermisos
  recorridoId: string
  ir: (n: Nav) => void
}

export function VistaRecorrido({ actor, recorridoId, ir }: Props) {
  const detalle = useLiveQuery(async () => (await consultas.detalleRecorrido(recorridoId)) ?? null, [recorridoId])
  const todasTablas = useLiveQuery(() => consultas.tablas(), [])
  const [agregar, setAgregar] = useState(false)
  const [selNuevas, setSelNuevas] = useState<string[]>([])
  const fallos = useFallos()

  if (detalle === undefined) return <div className="cargando">Cargando recorrido…</div>
  if (detalle === null) return <Faltante texto="El recorrido ya no existe." onVolver={() => ir({ vista: 'lista' })} />

  const { recorrido, operador } = detalle
  const evs = ordenarTablas(detalle.evaluaciones.map((e) => ({ ...e, codigo: e.tabla?.codigo ?? '?' })))
  const editable = puedeEditarRecorrido(actor, recorrido)
  const total = resumen(evs.flatMap((e) => e.plantas))
  const activas = (todasTablas ?? []).filter((t) => t.activa)

  async function cerrar() {
    // Un cambio que no se pudo guardar se perdería al cerrar: primero hay que reintentarlo.
    if (hayFallos()) {
      avisar('Hay cambios sin guardar. Toca Reintentar en el aviso rojo de arriba antes de cerrar el recorrido.')
      return
    }
    const vacias = evs.filter((e) => !e.plantas.length).length
    const incompletas = evs.flatMap((e) => e.plantas).filter((x) => !completa(x.planta, x.hojas)).length
    let msg = 'Ya no podrás editarlo desde el celular del operador.'
    if (vacias) msg += `\n\n${vacias} tabla(s) sin plantas capturadas.`
    if (incompletas) msg += `\n${incompletas} planta(s) con hojas sin calificar.`
    if (!(await confirmar(msg, { titulo: '¿Cerrar el recorrido?', aceptar: 'Cerrar recorrido' }))) return
    await repos.recorridos.cerrar(recorrido.id)
    avisar('Recorrido cerrado')
    ir({ vista: 'lista' })
  }

  async function eliminar() {
    if (!(await confirmar('Se eliminan también todas sus evaluaciones y plantas.', { titulo: '¿Eliminar este recorrido?', aceptar: 'Eliminar recorrido', peligro: true }))) return
    await repos.recorridos.eliminar(recorrido.id)
    ir({ vista: 'lista' })
  }

  async function agregarTablas() {
    await repos.recorridos.agregarTablas(recorrido.id, selNuevas)
    setSelNuevas([])
    setAgregar(false)
  }

  return (
    <div>
      <Migas onVolver={() => ir({ vista: 'lista' })}>Recorridos</Migas>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h1>Recorrido del {fechaSinAnio(recorrido.fecha)}</h1>
          <p className="muted">
            Semana {etiquetaSemana(recorrido.semana_iso)}, {operador}
          </p>
        </div>
        <EtqEstado estado={recorrido.estado} sincronizado={detalle.sincronizado} />
      </div>
      <div className="kpis" style={{ margin: '12px 0' }}>
        <div className="kpi">
          <b className="num">{total.n}</b>
          <span>plantas</span>
        </div>
        <div className="kpi">
          <b className="num">{fmt(total.ii)}</b>
          <span>II del recorrido (%)</span>
        </div>
        <div className="kpi">
          <b className="num">{fmt(total.hf)}</b>
          <span>HF promedio</span>
        </div>
      </div>
      <ul className="lista">
        {evs.map((e) => {
          const r = resumen(e.plantas)
          const estado = e.evaluacion.hora_fin ? 'Terminada' : e.plantas.length ? 'En captura' : 'Sin iniciar'
          return (
            <li key={e.evaluacion.id}>
              <button className="item" type="button" onClick={() => ir({ vista: 'tabla', recorridoId: recorrido.id, evaluacionId: e.evaluacion.id })}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{e.codigo}</div>
                  <div className="peq muted">
                    {estado}
                    {e.plantas.length ? `: ${r.n} plantas, II ${fmt(r.ii)}` : ''}
                  </div>
                </div>
                <div className="der num" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  {e.plantas.length}
                  <div className="peq muted" style={{ fontWeight: 400 }}>
                    plantas
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {editable && (
        <div className="seccion">
          {agregar ? (
            <div className="caja">
              <h3>Agregar tablas</h3>
              <div style={{ margin: '10px 0' }}>
                <SelectorTablas tablas={activas} sel={selNuevas} onCambio={setSelNuevas} deshabilitadas={evs.map((e) => e.evaluacion.tabla_id)} />
              </div>
              <div className="fila-btn">
                <button className="btn" type="button" onClick={() => setAgregar(false)}>
                  Cancelar
                </button>
                <button className="btn btn-p" type="button" disabled={!selNuevas.length} onClick={() => conAviso(agregarTablas())}>
                  Agregar
                </button>
              </div>
            </div>
          ) : (
            <div className="fila-btn">
              <button className="btn" type="button" onClick={() => setAgregar(true)}>
                Agregar tabla
              </button>
              {puedeCerrarRecorrido(actor, recorrido) && (
                <button className="btn btn-p" type="button" disabled={fallos.length > 0} onClick={() => conAviso(cerrar())}>
                  Cerrar recorrido
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {(puedeReabrirRecorrido(actor, recorrido) || puedeEliminarRecorrido(actor)) && (
        <div className="fila-btn" style={{ marginTop: 10 }}>
          {puedeReabrirRecorrido(actor, recorrido) && (
            <button
              className="btn btn-q"
              type="button"
              onClick={() => conAviso(repos.recorridos.reabrir(recorrido.id).then(() => avisar('Recorrido reabierto')))}
            >
              Reabrir recorrido
            </button>
          )}
          {puedeEliminarRecorrido(actor) && (
            <button className="btn btn-x" type="button" onClick={() => conAviso(eliminar())}>
              Eliminar recorrido
            </button>
          )}
        </div>
      )}
      {!editable && <div className="info">Este recorrido está cerrado. Solo el administrador puede corregirlo.</div>}
    </div>
  )
}
