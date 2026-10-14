import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { consultas } from '@/datos'
import {
  climaConDesfase, distribucion, efectoAplicacion, estadoTablas, filas, GRADOS_GAUHL, hf, hoy, iiPlanta, INDICADORES, lunesDeSemana, ordenarTablas, porSemana, promedio,
  rangoSemanas, resumen, semanaISO, semanaPorDefecto, semanasConRepunte, serie, sumarDias, sumarSemanas, tablasPorRevisar, tablasQueEmpeoran, valorEn,
  type Aplicacion, type Rancho, type Tabla,
} from '@/dominio'
import { TiraHojas, SelectorTablas } from '../captura/componentes'
import { etiquetaSemana, fechaSinAnio, fmt } from '../formato'
import { GraficaClima, GraficaLineas, type MarcadorAplicacion, type SerieGrafica } from './Graficas'
import { COLOR_SEMAFORO, MapaTablas, TEXTO_SEMAFORO } from './MapaTablas'

const CLIMA_VARS = { horas_hr_alta: 'Horas con HR alta', hr_media: 'HR media (%)', temp_media: 'Temp. media (°C)', temp_min: 'Temp. mínima (°C)' } as const
type VarClima = keyof typeof CLIMA_VARS

const colorSerie = (i: number) => `var(--s${(i % 8) + 1})`

export function Tablero({ rancho }: { rancho: Rancho }) {
  const datos = useLiveQuery(() => consultas.datosTablero(rancho.id), [rancho.id])
  if (!datos) return <div className="cargando">Cargando tablero…</div>
  return <TableroConDatos rancho={rancho} datos={datos} />
}

function TableroConDatos({ rancho, datos }: { rancho: Rancho; datos: NonNullable<Awaited<ReturnType<typeof consultas.datosTablero>>> }) {
  const hoyStr = hoy()
  // El rango no se guarda: al abrir el tablero siempre son las últimas 16 semanas hasta hoy.
  const desdeDefecto = sumarDias(hoyStr, -16 * 7)
  const [desde, setDesde] = useState(desdeDefecto)
  const [hasta, setHasta] = useState(hoyStr)
  const rangoCambiado = desde !== desdeDefecto || hasta !== hoyStr
  const [operador, setOperador] = useState('')
  const [selTablas, setSelTablas] = useState<string[]>([])
  const [mostrarFiltroTablas, setMostrarFiltroTablas] = useState(false)
  const [indK, setIndK] = useState('ii')
  const [desfase, setDesfase] = useState(4)
  const [varClima, setVarClima] = useState<VarClima>('horas_hr_alta')
  const [semSel, setSemSel] = useState<string | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [tablaDet, setTablaDet] = useState<string | null>(null)

  const { ii_umbral_medio, ii_umbral_alto } = rancho
  const umbrales = useMemo(() => ({ ii_umbral_medio, ii_umbral_alto }), [ii_umbral_medio, ii_umbral_alto])
  const indic = INDICADORES.find((i) => i.k === indK) ?? INDICADORES[0]

  const todasTablas = useMemo(() => ordenarTablas(datos.tablas.filter((t) => t.activa)), [datos.tablas])
  const tablasF = useMemo(() => (selTablas.length ? todasTablas.filter((t) => selTablas.includes(t.id)) : todasTablas), [todasTablas, selTablas])
  const nombreT = (id: string) => datos.tablas.find((t) => t.id === id)?.codigo ?? '?'

  const fs = useMemo(() => filas(datos.evaluaciones, datos.recorridos, { desde, hasta, operador: operador || undefined, tablas: selTablas }), [datos, desde, hasta, operador, selTablas])
  const serieF = useMemo(() => serie(fs), [fs])
  // Para el efecto de una aplicación se necesita la historia completa, no solo el rango filtrado.
  const serieTotal = useMemo(() => serie(filas(datos.evaluaciones, datos.recorridos)), [datos])
  const semanas = useMemo(() => (desde && hasta && desde <= hasta ? rangoSemanas(semanaISO(desde), semanaISO(hasta)) : []), [desde, hasta])
  const semanasConDatos = semanas.filter((s) => [...serieF.values()].some((m) => m.has(s)))
  const cobertura = (s: string) => [...serieF.values()].filter((m) => m.has(s)).length
  const semActiva = semSel && semanasConDatos.includes(semSel) ? semSel : semanaPorDefecto(semanasConDatos, cobertura)
  const climaSem = useMemo(() => porSemana(datos.clima), [datos.clima])

  const estado = estadoTablas(tablasF, serieF, semActiva, datos.aplicaciones, umbrales, hoyStr)
  const estadoOrdenado = estado.slice().sort((a, b) => (b.ii ?? -1) - (a.ii ?? -1))
  const valoresMapa = new Map(estado.map((e) => [e.tabla.id, e.ii]))
  const empeoran = tablasQueEmpeoran(estado)
  const revisar = tablasPorRevisar(estado, rancho.dias_alerta_aplicacion)

  const apps = useMemo(() => datos.aplicaciones.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)), [datos.aplicaciones])
  const appsVisibles = apps.filter((a) => a.tabla_ids.some((id) => tablasF.some((t) => t.id === id)))
  const conSeguimiento = (a: Aplicacion) =>
    a.tabla_ids.some((id) => {
      const e = efectoAplicacion(serieTotal, a, id)
      return e && e.antes != null && e.d2
    })
  const ultimaApp = appsVisibles.find(conSeguimiento) ?? appsVisibles[0]
  const masReciente = appsVisibles[0] && appsVisibles[0] !== ultimaApp ? appsVisibles[0] : null
  const efectoUltima = ultimaApp
    ? ultimaApp.tabla_ids.filter((id) => tablasF.some((t) => t.id === id)).flatMap((id) => {
        const e = efectoAplicacion(serieTotal, ultimaApp, id)
        return e && e.antes != null ? [e] : []
      })
    : []
  const promEfecto = (k: 'd2' | 'd4') => promedio(efectoUltima.map((e) => e[k]?.v ?? null))
  const antesProm = promedio(efectoUltima.map((e) => e.antes))

  const semRep = useMemo(() => semanasConRepunte(tablasF.map((t) => t.id), serieF), [tablasF, serieF])

  const series: SerieGrafica[] = tablasF.map((t, i) => ({ id: t.id, nombre: t.codigo, color: colorSerie(i), valores: semanas.map((s) => valorEn(serieF.get(t.id), s, indic)) }))
  if (series.length > 1) {
    const promRancho = semanas.map((s) => {
      const sub = fs.filter((x) => x.semana === s).flatMap((x) => x.plantas)
      return sub.length ? indic.get(resumen(sub)) : null
    })
    series.push({ id: 'rancho', nombre: 'Rancho', color: 'var(--ink)', valores: promRancho, grueso: true })
  }
  const marcadores: Array<MarcadorAplicacion & { app: Aplicacion }> = []
  for (const a of appsVisibles) {
    const i = semanas.indexOf(semanaISO(a.fecha))
    if (i >= 0) marcadores.push({ i, titulo: `${fechaSinAnio(a.fecha)}: ${a.producto} (FRAC ${a.grupo_frac})`, app: a })
  }
  const climaDesf = semanas.map((s) => climaSem.get(sumarSemanas(s, -desfase)) ?? null)
  const valorSemana = (arr: Array<number | null>, i: number) => (arr[i] == null ? '—' : fmt(arr[i], indic.dec))

  const detT = tablaDet && tablasF.some((t) => t.id === tablaDet) ? tablaDet : estadoOrdenado[0]?.tabla.id
  const det = detT && semActiva ? serieF.get(detT)?.get(semActiva) : undefined
  const dist = det ? distribucion(det.plantas) : []

  const comparativo = semActiva
    ? tablasF
        .map((t) => ({ t, v: valorEn(serieF.get(t.id), semActiva, indic) }))
        .flatMap((x) => (x.v == null ? [] : [{ t: x.t, v: x.v }]))
        .sort((a, b) => (indic.peorSi === 'sube' ? b.v - a.v : a.v - b.v))
    : []
  const maxComp = Math.max(...comparativo.map((f) => f.v), 1)

  const plantasPeriodo = fs.reduce((s, x) => s + x.plantas.length, 0)
  const hv = hover != null && semanas[hover] ? hover : null
  const dias = rancho.dias_alerta_aplicacion

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginRight: 'auto' }}>Tablero</h1>
        <span className="muted peq">
          {fs.length} evaluaciones de tabla, {plantasPeriodo} plantas en el periodo
        </span>
      </div>

      <div className="caja" style={{ margin: '12px 0 16px' }}>
        <div className="filtros">
          <label>
            Desde
            <input className="inp" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input className="inp" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          {rangoCambiado && (
            <button
              type="button"
              className="btn btn-s btn-q"
              onClick={() => {
                setDesde(desdeDefecto)
                setHasta(hoyStr)
              }}
            >
              Volver a hoy
            </button>
          )}
          <label>
            Semana de corte
            <select className="inp" value={semActiva ?? ''} onChange={(e) => setSemSel(e.target.value)} disabled={!semanasConDatos.length}>
              {semanasConDatos
                .slice()
                .reverse()
                .map((s) => (
                  <option key={s} value={s}>
                    {etiquetaSemana(s)} ({fechaSinAnio(lunesDeSemana(s))})
                  </option>
                ))}
            </select>
          </label>
          <label>
            Operador
            <select className="inp" value={operador} onChange={(e) => setOperador(e.target.value)}>
              <option value="">Todos</option>
              {datos.usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-s btn-q" aria-expanded={mostrarFiltroTablas} onClick={() => setMostrarFiltroTablas(!mostrarFiltroTablas)}>
            Tablas: {selTablas.length ? `${selTablas.length} de ${todasTablas.length}` : 'todas'}
          </button>
        </div>
        {mostrarFiltroTablas && (
          <div style={{ marginTop: 12 }}>
            <SelectorTablas tablas={todasTablas} sel={selTablas} onCambio={setSelTablas} />
            <button type="button" className="enlace" onClick={() => setSelTablas([])}>
              Ver todas
            </button>
          </div>
        )}
      </div>

      {!fs.length || !semActiva ? (
        <div className="caja vacio-panel">No hay evaluaciones con estos filtros. Amplía el rango de fechas o captura un recorrido.</div>
      ) : (
        <>
          <div className="respuestas" style={{ marginBottom: 16 }}>
            <div className="resp" style={{ borderLeftColor: 'var(--rojo)' }}>
              <h3>¿Qué tablas empeoran?</h3>
              {empeoran.length ? (
                <>
                  <p>{empeoran.slice(0, 5).map((e) => `${e.tabla.codigo} (+${fmt(e.delta)})`).join(', ')}</p>
                  <p className="muted peq">Subida del II respecto a la evaluación anterior, semana {etiquetaSemana(semActiva)}.</p>
                </>
              ) : (
                <p>Ninguna subió 2 puntos o más de II en {etiquetaSemana(semActiva)}.</p>
              )}
            </div>
            <div className="resp" style={{ borderLeftColor: 'var(--amarillo)' }}>
              <h3>¿Cuándo aplicar?</h3>
              {revisar.length ? (
                <p>Revisar: {revisar.slice(0, 6).map((e) => `${e.tabla.codigo} (II ${fmt(e.ii)}, ${e.dias == null ? 'sin aplicación' : e.dias + ' d'})`).join(', ')}</p>
              ) : (
                <p>Ninguna tabla en riesgo medio o alto con más de {dias} días sin aplicación.</p>
              )}
              <p className="muted peq">Regla provisional: semáforo medio o alto y {dias}+ días desde la última aplicación. Los umbrales se ajustan por rancho.</p>
            </div>
            <div className="resp" style={{ borderLeftColor: 'var(--leaf)' }}>
              <h3>¿Funcionó la última aplicación?</h3>
              {ultimaApp ? (
                <>
                  <p>
                    {fechaSinAnio(ultimaApp.fecha)}: {ultimaApp.producto} (FRAC {ultimaApp.grupo_frac || '—'}) en {ultimaApp.tabla_ids.length} tabla(s).
                  </p>
                  {antesProm != null ? (
                    <p>
                      II promedio: <b>{fmt(antesProm)}</b> antes →{' '}
                      {promEfecto('d2') != null ? (
                        <>
                          <b>{fmt(promEfecto('d2'))}</b> a 2 semanas
                        </>
                      ) : (
                        'sin dato a 2 semanas'
                      )}
                      {promEfecto('d4') != null && (
                        <>
                          {' '}
                          → <b>{fmt(promEfecto('d4'))}</b> a 4 semanas
                        </>
                      )}
                      .
                    </p>
                  ) : (
                    <p className="muted">No hay evaluaciones antes de la aplicación para comparar.</p>
                  )}
                  {masReciente && (
                    <p className="muted peq">
                      La más reciente ({fechaSinAnio(masReciente.fecha)}, {masReciente.producto}) aún no tiene 2 semanas de seguimiento.
                    </p>
                  )}
                </>
              ) : (
                <p>Sin aplicaciones registradas.</p>
              )}
            </div>
            <div className="resp" style={{ borderLeftColor: 'var(--info)' }}>
              <h3>¿Qué clima precedió los repuntes?</h3>
              {semRep.length && climaSem.size ? (
                <p>
                  {semRep.length} semana(s) con repunte (II +3 o más). {desfase} semanas antes hubo en promedio <b>{fmt(climaConDesfase(climaSem, semRep, 'horas_hr_alta', desfase), 0)} h</b> de HR alta y{' '}
                  <b>{fmt(climaConDesfase(climaSem, semRep, 'precipitacion', desfase), 0)} mm</b> de lluvia por semana, contra {fmt(climaConDesfase(climaSem, semanas, 'horas_hr_alta', desfase), 0)} h y{' '}
                  {fmt(climaConDesfase(climaSem, semanas, 'precipitacion', desfase), 0)} mm del periodo.
                </p>
              ) : (
                <p>{climaSem.size ? 'No hubo repuntes de 3 puntos o más en el periodo.' : 'Sin datos de clima para cruzar con los repuntes.'}</p>
              )}
            </div>
          </div>

          <div className="rej-tab">
            <section className="panel c5" aria-labelledby="t-mapa">
              <div className="panel-cab">
                <h2 id="t-mapa">Mapa de riesgo</h2>
                <span className="muted peq">II, semana {etiquetaSemana(semActiva)}</span>
              </div>
              <MapaTablas tablas={tablasF} valores={valoresMapa} umbrales={umbrales} sel={detT} onSel={setTablaDet} />
              <div className="leyenda">
                {(['verde', 'amarillo', 'rojo', 'sin'] as const).map((s) => (
                  <span key={s}>
                    <i className="sem" style={{ background: COLOR_SEMAFORO[s] }}></i>
                    {TEXTO_SEMAFORO[s]}
                    {s === 'verde' ? ` (<${umbrales.ii_umbral_medio})` : s === 'amarillo' ? ` (${umbrales.ii_umbral_medio}–${umbrales.ii_umbral_alto})` : s === 'rojo' ? ` (≥${umbrales.ii_umbral_alto})` : ''}
                  </span>
                ))}
              </div>
            </section>

            <section className="panel c7" aria-labelledby="t-estado">
              <div className="panel-cab">
                <h2 id="t-estado">Estado por tabla</h2>
                <span className="muted peq">Semana {etiquetaSemana(semActiva)} o la evaluación más reciente de las 2 semanas previas. Toca una fila para ver el detalle.</span>
              </div>
              <div className="desliza">
                <table className="datos">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Tabla</th>
                      <th className="n">II</th>
                      <th className="n">Δ II</th>
                      <th className="n">HF</th>
                      <th className="n">HMJE</th>
                      <th className="n">HMJM</th>
                      <th className="n">Plantas</th>
                      <th className="n">Días sin aplicar</th>
                      <th>Sem.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estadoOrdenado.map((e) => (
                      <tr key={e.tabla.id} className="clic" onClick={() => setTablaDet(e.tabla.id)} style={detT === e.tabla.id ? { outline: '2px solid var(--ink)' } : undefined}>
                        <td>
                          <i className="sem" style={{ background: COLOR_SEMAFORO[e.semaforo] }} title={TEXTO_SEMAFORO[e.semaforo]}></i>
                        </td>
                        <td>
                          <button type="button" className="enlace" style={{ textDecoration: 'none', color: 'inherit' }} aria-label={`Ver detalle de la tabla ${e.tabla.codigo}`}>
                            <b>{e.tabla.codigo}</b>
                          </button>
                        </td>
                        <td className="n">{fmt(e.ii)}</td>
                        <td className="n" style={{ color: e.delta == null ? '' : e.delta > 0.5 ? 'var(--error)' : e.delta < -0.5 ? 'var(--verde)' : '', fontWeight: 700 }}>
                          {e.delta == null ? '—' : (e.delta > 0 ? '+' : '') + fmt(e.delta)}
                        </td>
                        <td className="n">{fmt(e.resumen?.hf)}</td>
                        <td className="n">{fmt(e.resumen?.estria.prom)}</td>
                        <td className="n">{fmt(e.resumen?.mancha.prom)}</td>
                        <td className="n">{e.resumen ? e.resumen.n : '—'}</td>
                        <td className="n">{e.dias == null ? '—' : e.dias}</td>
                        <td className="peq" style={{ color: e.semana && e.semana !== semActiva ? 'var(--aviso)' : 'var(--ink-2)' }}>
                          {e.semana ? etiquetaSemana(e.semana) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel c12" aria-labelledby="t-tendencia">
              <div className="panel-cab">
                <h2 id="t-tendencia">Tendencia semanal</h2>
                <div className="seg" role="group" aria-label="Indicador">
                  {INDICADORES.map((i) => (
                    <button key={i.k} type="button" className={indK === i.k ? 'activo' : ''} aria-pressed={indK === i.k} onClick={() => setIndK(i.k)}>
                      {i.corto}
                    </button>
                  ))}
                </div>
              </div>
              <p className="muted peq" style={{ marginTop: -4 }}>
                {indic.nombre}
                {indic.unidad ? ` (${indic.unidad})` : ''}. {indic.peorSi === 'sube' ? 'Más alto es peor.' : 'Más bajo es peor.'} Los triángulos marcan aplicaciones de fungicida.
              </p>
              <GraficaLineas
                semanas={semanas}
                series={series}
                marcadores={marcadores}
                sel={hv}
                onSel={setHover}
                ceroBase={indK === 'ii'}
                refs={indK === 'ii' ? [{ v: umbrales.ii_umbral_medio, color: 'var(--amarillo)', etq: 'umbral medio' }, { v: umbrales.ii_umbral_alto, color: 'var(--rojo)', etq: 'umbral alto' }] : []}
              />
              <div className="leyenda">
                {series.map((s) => (
                  <span key={s.id}>
                    <i className="sem" style={{ background: s.color }}></i>
                    {s.nombre}
                  </span>
                ))}
              </div>
              <div className="panel-cab" style={{ marginTop: 14 }}>
                <h3 style={{ marginRight: 'auto' }}>Clima de {desfase === 0 ? 'la misma semana' : desfase + ' semana' + (desfase > 1 ? 's' : '') + ' antes'}</h3>
                <label className="peq" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                  Desfase
                  <select className="inp" style={{ width: 'auto', minHeight: 48 }} value={desfase} onChange={(e) => setDesfase(Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} sem
                      </option>
                    ))}
                  </select>
                </label>
                <select className="inp" style={{ width: 'auto', minHeight: 48 }} aria-label="Variable de clima" value={varClima} onChange={(e) => setVarClima(e.target.value as VarClima)}>
                  {Object.entries(CLIMA_VARS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {climaSem.size ? (
                <GraficaClima
                  semanas={semanas}
                  barras={climaDesf.map((c) => c?.precipitacion ?? null)}
                  linea={climaDesf.map((c) => c?.[varClima] ?? null)}
                  sel={hv}
                  onSel={setHover}
                  etqBarras="Lluvia (mm/sem)"
                  etqLinea={CLIMA_VARS[varClima]}
                />
              ) : (
                <div className="vacio-panel">Sin datos de clima.</div>
              )}
              {hv != null && (
                <div className="lectura">
                  <b>{etiquetaSemana(semanas[hv])}</b> ({fechaSinAnio(lunesDeSemana(semanas[hv]))}):{' '}
                  {series.filter((s) => s.valores[hv] != null).map((s) => `${s.nombre} ${valorSemana(s.valores, hv)}`).join(', ') || 'sin evaluaciones'}.
                  {marcadores.filter((m) => m.i === hv).map((m) => (
                    <div key={m.app.id}>Aplicación: {m.titulo}</div>
                  ))}
                  {climaDesf[hv] && (
                    <div>
                      Clima {desfase ? `de ${etiquetaSemana(sumarSemanas(semanas[hv], -desfase))}` : ''}: lluvia {fmt(climaDesf[hv].precipitacion, 0)} mm, HR media {fmt(climaDesf[hv].hr_media, 0)} %, {fmt(climaDesf[hv].horas_hr_alta, 0)} h de HR alta, temp. media{' '}
                      {fmt(climaDesf[hv].temp_media)} °C.
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="panel c6" aria-labelledby="t-comp">
              <div className="panel-cab">
                <h2 id="t-comp">Comparativo de la semana</h2>
                <span className="muted peq">
                  {indic.corto}, {etiquetaSemana(semActiva)}
                </span>
              </div>
              {comparativo.length ? (
                comparativo.map((f) => (
                  <div key={f.t.id} className="barra-h">
                    <b>{f.t.codigo}</b>
                    <div className="fondo">
                      <div className="val" style={{ width: (f.v / maxComp) * 100 + '%', background: indK === 'ii' ? COLOR_SEMAFORO[estado.find((e) => e.tabla.id === f.t.id)?.semaforo ?? 'sin'] : 'var(--leaf)' }}></div>
                    </div>
                    <span className="num" style={{ textAlign: 'right' }}>
                      {fmt(f.v, indic.dec)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="vacio-panel">Sin datos en esta semana.</div>
              )}
            </section>

            <section className="panel c6" aria-labelledby="t-efecto">
              <div className="panel-cab">
                <h2 id="t-efecto">Efecto de las aplicaciones</h2>
                <span className="muted peq">II antes y después, últimas 4 aplicaciones</span>
              </div>
              {appsVisibles.length ? (
                <div className="desliza">
                  <table className="datos">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Producto</th>
                        <th>FRAC</th>
                        <th>Tabla</th>
                        <th className="n">Antes</th>
                        <th className="n">+2 sem</th>
                        <th className="n">+4 sem</th>
                        <th className="n">Cambio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appsVisibles.slice(0, 4).flatMap((a) =>
                        a.tabla_ids.filter((id) => tablasF.some((t) => t.id === id)).map((id, j) => {
                          const e = efectoAplicacion(serieTotal, a, id)
                          const ref = e?.d4 ?? e?.d2
                          const dd = ref && ref.v != null && e?.antes != null ? ref.v - e.antes : null
                          return (
                            <tr key={a.id + id}>
                              <td>{j === 0 ? fechaSinAnio(a.fecha) : ''}</td>
                              <td>{j === 0 ? a.producto : ''}</td>
                              <td>{j === 0 ? a.grupo_frac : ''}</td>
                              <td>
                                <b>{nombreT(id)}</b>
                              </td>
                              <td className="n">{fmt(e?.antes)}</td>
                              <td className="n">{fmt(e?.d2?.v)}</td>
                              <td className="n">{fmt(e?.d4?.v)}</td>
                              <td className="n" style={{ color: dd == null ? '' : dd < 0 ? 'var(--verde)' : 'var(--error)', fontWeight: 700 }}>
                                {dd == null ? '—' : (dd > 0 ? '+' : '') + fmt(dd)}
                              </td>
                            </tr>
                          )
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="vacio-panel">Sin aplicaciones registradas.</div>
              )}
            </section>

            <section className="panel c12" aria-labelledby="t-detalle">
              <div className="panel-cab">
                <h2 id="t-detalle">Detalle por planta y hoja</h2>
                <select className="inp" style={{ width: 'auto', minHeight: 48 }} aria-label="Tabla del detalle" value={detT ?? ''} onChange={(e) => setTablaDet(e.target.value)}>
                  {tablasF.map((t: Tabla) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo}
                    </option>
                  ))}
                </select>
                <span className="muted peq">semana {etiquetaSemana(semActiva)}</span>
              </div>
              {det ? (
                <div>
                  <div className="kpis" style={{ marginBottom: 12 }}>
                    <div className="kpi">
                      <b className="num">{fmt(det.r.ii)}</b>
                      <span>II (%)</span>
                    </div>
                    <div className="kpi">
                      <b className="num">{fmt(det.r.th)}</b>
                      <span>TH prom.</span>
                    </div>
                    <div className="kpi">
                      <b className="num">{fmt(det.r.hf)}</b>
                      <span>HF prom.</span>
                    </div>
                    <div className="kpi">
                      <b className="num">{fmt(det.r.pizca.prom)}</b>
                      <span>Pizca prom.{det.r.pizca.no_presenta ? ` (${det.r.pizca.no_presenta} sin pizca)` : ''}</span>
                    </div>
                    <div className="kpi">
                      <b className="num">{fmt(det.r.estria.prom)}</b>
                      <span>HMJE prom.{det.r.estria.no_presenta ? ` (${det.r.estria.no_presenta} sin estría)` : ''}</span>
                    </div>
                    <div className="kpi">
                      <b className="num">{fmt(det.r.mancha.prom)}</b>
                      <span>HMJM prom.{det.r.mancha.no_presenta ? ` (${det.r.mancha.no_presenta} sin mancha)` : ''}</span>
                    </div>
                  </div>
                  <h3 style={{ margin: '8px 0' }}>Distribución de grados por posición de hoja</h3>
                  {dist.map((fila, i) => {
                    const tot = fila.reduce((a, b) => a + b, 0)
                    return tot ? (
                      <div key={i} className="barra-h" style={{ gridTemplateColumns: '64px 1fr 44px' }}>
                        <span className="peq">Hoja {i + 1}</span>
                        <div className="apilada">
                          {fila.map((c, g) => (c ? <div key={g} className={'gc' + g} style={{ width: (c / tot) * 100 + '%' }} title={`Grado ${g}: ${c} hoja(s)`}></div> : null))}
                        </div>
                        <span className="peq muted num" style={{ textAlign: 'right' }}>
                          {tot}
                        </span>
                      </div>
                    ) : null
                  })}
                  <div className="leyenda">
                    {GRADOS_GAUHL.map((g) => (
                      <span key={g.grado}>
                        <i className={'cuad gc' + g.grado} style={{ width: 18, height: 18 }}></i>
                        {g.grado}
                      </span>
                    ))}
                  </div>
                  <h3 style={{ margin: '14px 0 8px' }}>Plantas</h3>
                  <div className="desliza">
                    <table className="datos">
                      <thead>
                        <tr>
                          <th className="n">Nº</th>
                          <th className="n">TH</th>
                          <th className="n">HF</th>
                          <th className="n">II</th>
                          <th className="n">Pizca</th>
                          <th className="n">Estría</th>
                          <th className="n">Mancha</th>
                          <th>Hojas (grado Gauhl)</th>
                          <th>Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.plantas
                          .slice()
                          .sort((a, b) => a.planta.numero_planta - b.planta.numero_planta)
                          .map(({ planta: p, hojas }) => (
                            <tr key={p.id}>
                              <td className="n">{p.numero_planta}</td>
                              <td className="n">{p.total_hojas}</td>
                              <td className="n">{hf(hojas)}</td>
                              <td className="n">{fmt(iiPlanta(hojas))}</td>
                              {[p.hmj_pizca, p.hmj_estria, p.hmj_mancha].map((v, k) => (
                                <td key={k} className="n">
                                  {v == null ? '—' : v === 0 ? 'NP' : v}
                                </td>
                              ))}
                              <td>
                                <TiraHojas hojas={hojas} />
                              </td>
                              <td style={{ whiteSpace: 'normal', minWidth: 140 }}>{p.observaciones}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="peq muted">NP = no presenta.</p>
                </div>
              ) : (
                <div className="vacio-panel">Sin evaluación de esta tabla en la semana seleccionada.</div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
