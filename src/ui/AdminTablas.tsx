import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, leerPoligonos, repos, type CambiosTabla, type ResultadoImportacion } from '@/datos'
import { ordenarTablas, type Tabla } from '@/dominio'
import { enSegundoPlano } from './dialogos'

const ORIGEN: Record<Tabla['origen'], string> = { kmz: 'KMZ', manual: 'Manual' }

/** Pantalla de tablas del administrador: lista editable e importación de KMZ/KML. */
export function AdminTablas({ ranchoId }: { ranchoId: string }) {
  const todas = useLiveQuery(() => consultas.tablas(), [])
  const [desactivar, setDesactivar] = useState(true)
  const [msg, setMsg] = useState<{ tipo: 'info' | 'error'; texto: string; avisos?: string[] } | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const tablas = ordenarTablas(todas ?? [])

  const editar = (t: Tabla, cambios: CambiosTabla) => enSegundoPlano(repos.tablas.editar(t.id, cambios))

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const poligonos = await leerPoligonos(f, f.name)
      const r: ResultadoImportacion = await repos.tablas.importar(ranchoId, poligonos, { desactivarFaltantes: desactivar })
      setMsg({
        tipo: 'info',
        texto: `Importadas ${r.nuevas} tabla(s) nueva(s) y ${r.actualizadas} actualizada(s).${r.desactivadas ? ` Se desactivaron ${r.desactivadas} que no venían en el archivo (sus datos históricos se conservan).` : ''}`,
        avisos: r.advertencias,
      })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo leer el archivo.' })
    }
  }

  return (
    <div>
      <h1>Tablas</h1>
      <p className="peq muted">
        {tablas.filter((t) => t.activa).length} activas de {tablas.length}. Importa el KMZ o KML del rancho; si una tabla ya existe con el mismo código, se actualiza su polígono y su superficie.
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
