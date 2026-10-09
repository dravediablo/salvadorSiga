import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { claveTablaCampo, consultas, enSegundoPlano, leerPoligonos, repos, type CambiosTabla, type ResultadoImportacion } from '@/datos'
import { ordenarTablas, type Tabla } from '@/dominio'
import { fmt } from './formato'

const ORIGEN: Record<Tabla['origen'], string> = { kmz: 'KMZ', manual: 'Manual' }

/** Pantalla de tablas del administrador: lista editable e importación de KMZ/KML. */
export function AdminTablas({ ranchoId }: { ranchoId: string }) {
  const todas = useLiveQuery(() => consultas.tablas(), [])
  const [desactivar, setDesactivar] = useState(true)
  const [msg, setMsg] = useState<{ tipo: 'info' | 'error'; texto: string; avisos?: string[] } | null>(null)
  // Tablas cuya superficie guardada difiere del polígono nuevo; el administrador decide cuáles actualizar.
  const [difieren, setDifieren] = useState<ResultadoImportacion['cambiosSuperficie']>([])
  // Vienen en el archivo pero están desactivadas: el administrador decide si las activa.
  const [apagadas, setApagadas] = useState<ResultadoImportacion['desactivadasEnArchivo']>([])
  const archivo = useRef<HTMLInputElement>(null)
  const tablas = ordenarTablas(todas ?? [])

  const editar = (t: Tabla, cambios: CambiosTabla) => {
    for (const [campo, valor] of Object.entries(cambios)) void enSegundoPlano(() => repos.tablas.editar(t.id, { [campo]: valor }), claveTablaCampo(t.id, campo))
  }

  const aplicarSuperficie = (c: ResultadoImportacion['cambiosSuperficie'][number]) => {
    void enSegundoPlano(() => repos.tablas.editar(c.tabla_id, { superficie_ha: c.poligono }), claveTablaCampo(c.tabla_id, 'superficie_ha'))
    setDifieren((l) => l.filter((x) => x.tabla_id !== c.tabla_id))
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const poligonos = await leerPoligonos(f, f.name)
      const r: ResultadoImportacion = await repos.tablas.importar(ranchoId, poligonos, { desactivarFaltantes: desactivar })
      setDifieren(r.cambiosSuperficie)
      setApagadas(r.desactivadasEnArchivo)
      const avisos = [...r.advertencias]
      if (r.omitidas.length) avisos.push(`No se importaron ${r.omitidas.length} franja(s) "buffer": ${r.omitidas.join('; ')}.`)
      if (r.buffersConEvaluaciones.length) avisos.push(`La(s) tabla(s) ${r.buffersConEvaluaciones.join(', ')} es/son franja(s) "buffer" con evaluaciones capturadas: se dejó/dejaron desactivada(s) en vez de eliminarse.`)
      if (r.buffersEliminados) avisos.push(`Se dieron de baja ${r.buffersEliminados} tabla(s) "buffer" que se habían importado antes.`)
      setMsg({
        tipo: 'info',
        texto: `Importadas ${r.nuevas} tabla(s) nueva(s) y ${r.actualizadas} actualizada(s) (polígono y nombre; la superficie guardada se conserva).${r.desactivadas ? ` Se desactivaron ${r.desactivadas} que no venían en el archivo (sus datos históricos se conservan).` : ''}`,
        avisos,
      })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo leer el archivo.' })
    }
  }

  return (
    <div>
      <h1>Tablas</h1>
      <p className="peq muted">
        {tablas.filter((t) => t.activa).length} activas de {tablas.length}. Importa el KMZ o KML del rancho; si una tabla ya existe con el mismo código, se actualizan su polígono y su nombre, y se conserva su superficie. Las franjas "buffer" no se importan.
      </p>
      {msg && (
        <div className={msg.tipo === 'error' ? 'error' : 'info'} role={msg.tipo === 'error' ? 'alert' : 'status'}>
          {msg.texto}
          {msg.avisos && msg.avisos.length > 0 && (
            <ul>
              {msg.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {apagadas.length > 0 && (
        <div className="aviso" role="status">
          <b>Vienen en el archivo pero están desactivadas: {apagadas.map((a) => a.codigo).join(', ')}</b>
          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-s"
              type="button"
              onClick={() => {
                for (const a of apagadas) void enSegundoPlano(() => repos.tablas.editar(a.tabla_id, { activa: true }), claveTablaCampo(a.tabla_id, 'activa'))
                setApagadas([])
              }}
            >
              Activarlas
            </button>
          </div>
        </div>
      )}
      {difieren.length > 0 && (
        <div className="aviso" role="status">
          <b>La superficie del polígono difiere más de 5 % de la guardada en:</b>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {difieren.map((c) => (
              <li key={c.tabla_id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '6px 0' }}>
                <span style={{ flex: 1, minWidth: 180 }}>
                  Tabla {c.codigo}: guardada {fmt(c.guardada, 2)} ha, polígono {fmt(c.poligono, 2)} ha ({fmt(c.diferencia * 100, 0)} %)
                </span>
                <button className="btn btn-s" type="button" onClick={() => aplicarSuperficie(c)}>
                  Usar {fmt(c.poligono, 2)} ha
                </button>
              </li>
            ))}
          </ul>
          <div className="peq">Si no tocas nada, se conserva la superficie guardada.</div>
        </div>
      )}
      <input ref={archivo} type="file" accept=".kmz,.kml" hidden onChange={(e) => void importar(e)} aria-label="Archivo KMZ o KML para reimportar" />
      <label className="interruptor" style={{ display: 'flex' }}>
        <input type="checkbox" checked={desactivar} onChange={(e) => setDesactivar(e.target.checked)} />
        Desactivar las tablas que no vengan en el archivo
      </label>
      <button className="btn btn-p" type="button" onClick={() => archivo.current?.click()}>
        Importar KMZ o KML
      </button>
      <div className="desliza" style={{ marginTop: 12 }}>
        <table className="datos tabla-admin">
          <thead>
            <tr>
              <th>Código</th>
              <th>Variedad</th>
              <th className="n">Superficie (ha)</th>
              <th>Origen</th>
              <th>Activa</th>
            </tr>
          </thead>
          <tbody>
            {tablas.map((t) => (
              <tr key={t.id}>
                <td>
                  <input
                    key={t.codigo}
                    aria-label={'Código de la tabla ' + t.codigo}
                    defaultValue={t.codigo}
                    style={{ minWidth: 90 }}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== t.codigo) editar(t, { codigo: v })
                    }}
                  />
                </td>
                <td>
                  <input
                    key={t.variedad + t.updated_at}
                    aria-label={'Variedad de la tabla ' + t.codigo}
                    defaultValue={t.variedad}
                    style={{ minWidth: 120 }}
                    onBlur={(e) => e.target.value.trim() !== t.variedad && editar(t, { variedad: e.target.value.trim() })}
                  />
                </td>
                <td>
                  <input
                    key={String(t.superficie_ha) + t.updated_at}
                    aria-label={'Superficie de la tabla ' + t.codigo}
                    type="number"
                    step="0.01"
                    defaultValue={t.superficie_ha ?? ''}
                    style={{ width: 100 }}
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      if (v !== t.superficie_ha) editar(t, { superficie_ha: v })
                    }}
                  />
                </td>
                <td className="peq muted">{ORIGEN[t.origen]}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={t.activa}
                    style={{ width: 28, height: 28, minHeight: 0 }}
                    onChange={(e) => editar(t, { activa: e.target.checked })}
                    aria-label={'Activa ' + t.codigo}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
