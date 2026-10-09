import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, enSegundoPlano, repos, type CambiosPlanta, type DetallePlanta } from '@/datos'
import { hf, iiPlanta, puedeEditarRecorrido, validar, type ActorPermisos, type GradoGauhl, type Hoja } from '@/dominio'
import { useInstalacion } from '@/pwa/instalacion'
import { asegurarPersistencia } from '@/pwa/persistencia'
import { avisar, confirmar, conAviso } from '../dialogos'
import { fmt } from '../formato'
import { IconoAtras } from '../iconos'
import type { Nav } from '../navegacion'
import { Faltante, SelectorHoja, Stepper, TiraHojas } from './componentes'
import { ModalHojas } from './ModalHojas'

interface Props {
  actor: ActorPermisos
  nav: Nav
  ir: (n: Nav) => void
}

export function VistaPlanta({ actor, nav, ir }: Props) {
  const evaluacionId = nav.evaluacionId ?? ''
  const plantaId = nav.plantaId ?? ''
  const detalle = useLiveQuery(async () => (await consultas.detallePlanta(evaluacionId, plantaId)) ?? null, [evaluacionId, plantaId])

  // Al cambiar de planta, useLiveQuery devuelve un instante los datos de la anterior: no se usan.
  if (detalle === undefined || (detalle !== null && detalle.planta.id !== plantaId)) return <div className="cargando">Cargando planta…</div>
  if (detalle === null) return <Faltante texto="La planta ya no existe." onVolver={() => ir({ vista: 'lista' })} />
  // `key` reinicia el borrador cuando se cambia de planta.
  return <FormularioPlanta key={plantaId} detalle={detalle} actor={actor} nav={nav} ir={ir} />
}

function FormularioPlanta({ detalle, actor, nav, ir }: { detalle: DetallePlanta } & Props) {
  const { recorrido, tabla, hojas, plantas, evaluacion } = detalle
  const { instalada } = useInstalacion()
  // Borrador local: los campos responden al instante; la escritura va en segundo plano y en orden.
  const [p, setP] = useState(detalle.planta)
  const [gpsMsg, setGpsMsg] = useState<string | null>(null)
  const editable = puedeEditarRecorrido(actor, recorrido)
  const v = validar(p, hojas)
  const pos = plantas.findIndex((x) => x.planta.id === p.id)
  const faltan = hojas.filter((h) => h.grado_gauhl == null).length
  const codigo = tabla?.codigo ?? '?'

  function cambiar(cambios: CambiosPlanta) {
    if (!editable) return
    setP((x) => ({ ...x, ...cambios }))
    void enSegundoPlano(() => repos.plantas.actualizar(p.id, cambios), `planta:${p.id}:${Object.keys(cambios).sort().join(',')}`)
  }

  function cambiarTh(n: number) {
    if (!editable) return
    setP((x) => ({ ...x, total_hojas: n }))
    void enSegundoPlano(() => repos.plantas.cambiarTotalHojas(p.id, n), `th:${p.id}`)
  }

  function calificar(hoja: Hoja, grado: GradoGauhl) {
    void enSegundoPlano(() => repos.plantas.calificarHoja(hoja.id, grado), `hoja:${hoja.id}`)
  }

  async function siguiente() {
    if (v.errores.length) {
      avisar('Corrige los datos marcados en rojo.')
      return
    }
    if (faltan) {
      const seguir = await confirmar('¿Pasar a la siguiente planta de todos modos?', {
        titulo: `Faltan ${faltan} hoja(s) por calificar`,
        aceptar: 'Pasar a la siguiente',
        cancelar: 'Seguir calificando',
      })
      if (!seguir) return
    }
    if (pos < plantas.length - 1) {
      ir({ ...nav, plantaId: plantas[pos + 1].planta.id, hojas: false })
      return
    }
    void asegurarPersistencia(instalada)
    const { planta } = await repos.plantas.crear(evaluacion.id)
    ir({ ...nav, plantaId: planta.id, hojas: false })
  }

  async function borrar() {
    const ok = await confirmar('Se borran sus datos y la calificación de sus hojas.', {
      titulo: `¿Eliminar la planta ${p.numero_planta}?`,
      aceptar: 'Eliminar planta',
      peligro: true,
    })
    if (!ok) return
    await repos.plantas.eliminar(p.id)
    ir({ ...nav, vista: 'tabla', plantaId: undefined, hojas: false })
  }

  function gps() {
    if (!navigator.geolocation) {
      setGpsMsg('Este dispositivo no permite obtener la ubicación.')
      return
    }
    setGpsMsg('Obteniendo ubicación…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cambiar({ gps_lat: +pos.coords.latitude.toFixed(6), gps_lon: +pos.coords.longitude.toFixed(6), gps_precision_m: Math.round(pos.coords.accuracy) })
        setGpsMsg(null)
      },
      () => setGpsMsg('No se pudo obtener la ubicación. Revisa el permiso de ubicación del navegador.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const tieneGps = p.gps_lat != null && p.gps_lon != null
  const abrirModal = () => ir({ ...nav, hojas: true })

  return (
    <div style={{ paddingBottom: editable ? 80 : 0 }}>
      <div className="migas">
        <button className="volver" type="button" onClick={() => ir({ ...nav, vista: 'tabla', plantaId: undefined, hojas: false })}>
          <IconoAtras />
          Tabla {codigo}
        </button>
        <span className="muted peq" style={{ marginLeft: 'auto' }}>
          Planta {pos + 1} de {plantas.length}
        </span>
      </div>
      {!editable && <div className="info">Solo lectura: el recorrido está cerrado.</div>}
      <div className="paso">
        <div>
          <div className="tit">Número de planta</div>
          <div className="sub">Consecutivo en la tabla</div>
        </div>
        <Stepper etiqueta="número de planta" valor={p.numero_planta} min={1} max={200} onCambio={(n) => cambiar({ numero_planta: n })} />
      </div>
      <div className="paso">
        <div>
          <div className="tit">Total de hojas (TH)</div>
          <div className="sub">Todas las hojas en pie, incluidas las muy dañadas</div>
        </div>
        <Stepper etiqueta="total de hojas" valor={p.total_hojas} min={1} max={25} onCambio={cambiarTh} />
      </div>
      <SelectorHoja titulo="Hoja más joven con pizca" valor={p.hmj_pizca} th={p.total_hojas} onCambio={(n) => cambiar({ hmj_pizca: n })} />
      <SelectorHoja titulo="Hoja más joven con estría" valor={p.hmj_estria} th={p.total_hojas} onCambio={(n) => cambiar({ hmj_estria: n })} />
      <SelectorHoja titulo="Hoja más joven con mancha o quema" valor={p.hmj_mancha} th={p.total_hojas} onCambio={(n) => cambiar({ hmj_mancha: n })} />
      <div className="sintoma">
        <div className="cab">
          <span style={{ fontWeight: 700 }}>Severidad por hoja (Gauhl)</span>
          <span className="peq muted">
            HF {hf(hojas)}, II {fmt(iiPlanta(hojas))}
          </span>
        </div>
        {editable ? (
          <button className="tira-boton" type="button" aria-label="Abrir la calificación de hojas" onClick={abrirModal}>
            <TiraHojas hojas={hojas} />
          </button>
        ) : (
          <TiraHojas hojas={hojas} />
        )}
        {editable && (
          <button className={'btn btn-b ' + (faltan ? 'btn-p' : '')} type="button" style={{ marginTop: 10 }} onClick={abrirModal}>
            {faltan === hojas.length ? `Calificar las ${p.total_hojas} hojas` : faltan ? `Calificar hojas (faltan ${faltan})` : 'Revisar calificación de hojas'}
          </button>
        )}
      </div>
      {v.errores.length > 0 && (
        <div className="error" role="alert">
          <ul>
            {v.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {v.avisos.length > 0 && (
        <div className="aviso">
          <ul>
            {v.avisos.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <label className="campo">
        <span>Observaciones</span>
        <textarea className="inp" disabled={!editable} value={p.observaciones} placeholder="Opcional" onChange={(e) => cambiar({ observaciones: e.target.value })}></textarea>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {editable && (
          <button className="btn btn-s btn-q" type="button" onClick={gps}>
            {tieneGps ? 'Actualizar ubicación' : 'Agregar ubicación GPS'}
          </button>
        )}
        <span className="peq muted">{gpsMsg ?? (tieneGps ? `${p.gps_lat}, ${p.gps_lon} (±${p.gps_precision_m} m)` : 'Ubicación opcional')}</span>
      </div>
      {editable && (
        <button className="enlace" type="button" style={{ color: 'var(--error)', marginTop: 12 }} onClick={() => conAviso(borrar())}>
          Eliminar esta planta
        </button>
      )}
      {editable && (
        <div className="pie-fijo">
          <div>
            <button
              className="btn"
              type="button"
              style={{ flex: '0 0 auto' }}
              disabled={pos <= 0}
              onClick={() => ir({ ...nav, plantaId: plantas[pos - 1].planta.id, hojas: false })}
              aria-label="Planta anterior"
            >
              <IconoAtras />
            </button>
            <button className="btn btn-p" type="button" style={{ flex: 1 }} onClick={() => conAviso(siguiente())}>
              {pos < plantas.length - 1 ? 'Siguiente planta' : 'Guardar y nueva planta'}
            </button>
          </div>
        </div>
      )}
      {nav.hojas && editable && <ModalHojas planta={p} hojas={hojas} codigoTabla={codigo} onGrado={calificar} onCerrar={() => ir({ ...nav, hojas: false })} />}
    </div>
  )
}
