import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, repos } from '@/datos'
import { completa, hf, iiPlanta, puedeEditarRecorrido, resumen, validar, type ActorPermisos } from '@/dominio'
import { asegurarPersistencia } from '@/pwa/persistencia'
import { useInstalacion } from '@/pwa/instalacion'
import { avisar, enSegundoPlano } from '../dialogos'
import { fechaSinAnio, fmt, horaCorta } from '../formato'
import type { Nav } from '../navegacion'
import { Faltante, Migas, TiraHojas } from './componentes'

interface Props {
  actor: ActorPermisos
  nav: Nav
  ir: (n: Nav) => void
}

export function VistaTabla({ actor, nav, ir }: Props) {
  const evaluacionId = nav.evaluacionId ?? ''
  const detalle = useLiveQuery(async () => (await consultas.detalleTabla(evaluacionId)) ?? null, [evaluacionId])
  const { instalada } = useInstalacion()

  if (detalle === undefined) return <div className="cargando">Cargando tabla…</div>
  if (detalle === null) return <Faltante texto="La tabla del recorrido ya no existe." onVolver={() => ir({ vista: 'lista' })} />

  const { evaluacion, recorrido, tabla, plantas } = detalle
  const editable = puedeEditarRecorrido(actor, recorrido)
  const r = resumen(plantas)
  const siguienteNumero = plantas.length ? Math.max(...plantas.map((x) => x.planta.numero_planta)) + 1 : 1

  async function nueva() {
    void asegurarPersistencia(instalada) // primera captura: pide almacenamiento persistente
    const { planta } = await repos.plantas.crear(evaluacion.id)
    ir({ ...nav, vista: 'planta', plantaId: planta.id, hojas: false })
  }

  async function terminar() {
    await repos.recorridos.terminarTabla(evaluacion.id)
    avisar(`Tabla ${tabla?.codigo ?? ''} terminada`)
    ir({ vista: 'recorrido', recorridoId: recorrido.id })
  }

  return (
    <div>
      <Migas onVolver={() => ir({ vista: 'recorrido', recorridoId: recorrido.id })}>Recorrido del {fechaSinAnio(recorrido.fecha)}</Migas>
      <h1>Tabla {tabla?.codigo ?? '?'}</h1>
      <p className="muted">
        {tabla?.variedad ?? ''}
        {tabla?.superficie_ha ? `${tabla.variedad ? ', ' : ''}${fmt(tabla.superficie_ha, 2)} ha` : ''}
        {evaluacion.hora_inicio ? `, inicio ${horaCorta(evaluacion.hora_inicio)}` : ''}
        {evaluacion.hora_fin ? `, fin ${horaCorta(evaluacion.hora_fin)}` : ''}
      </p>
      <div className="kpis" style={{ margin: '12px 0' }}>
        <div className="kpi">
          <b className="num">{r.n}</b>
          <span>plantas (lo normal: 18–20)</span>
        </div>
        <div className="kpi">
          <b className="num">{fmt(r.ii)}</b>
          <span>II (%)</span>
        </div>
        <div className="kpi">
          <b className="num">{fmt(r.th)}</b>
          <span>TH promedio</span>
        </div>
        <div className="kpi">
          <b className="num">{fmt(r.hf)}</b>
          <span>HF promedio</span>
        </div>
      </div>
      {editable && (
        <button className="btn btn-p btn-b" type="button" style={{ margin: '6px 0 14px' }} onClick={() => enSegundoPlano(nueva())}>
          Nueva planta (nº {siguienteNumero})
        </button>
      )}
      <ul className="lista">
        {[...plantas].reverse().map(({ planta, hojas }) => {
          const ok = completa(planta, hojas)
          const v = validar(planta, hojas)
          return (
            <li key={planta.id}>
              <button className="item" type="button" onClick={() => ir({ ...nav, vista: 'planta', plantaId: planta.id, hojas: false })}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, minWidth: 44 }} className="num">
                  {planta.numero_planta}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="peq">
                    TH {planta.total_hojas}, HF {hf(hojas)}, II {fmt(iiPlanta(hojas))}
                  </div>
                  <div className="peq" style={{ color: v.errores.length ? 'var(--error)' : ok ? 'var(--ink-2)' : 'var(--aviso)', fontWeight: 700 }}>
                    {v.errores.length ? 'Revisar datos' : ok ? 'Completa' : 'Incompleta'}
                  </div>
                </div>
                <div className="der" style={{ maxWidth: '45%' }}>
                  <TiraHojas hojas={hojas} />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {!plantas.length && <div className="caja vacio-panel">Aún no hay plantas. Elige una planta parida y captúrala.</div>}
      {editable && plantas.length > 0 && (
        <button className="btn btn-b" type="button" style={{ marginTop: 16 }} onClick={() => enSegundoPlano(terminar())}>
          Terminar tabla
        </button>
      )}
    </div>
  )
}
