import { useRef, useState } from 'react'
import { leerPoligonos, repos } from '@/datos'
import { AccesoDesarrollo } from './AccesoDesarrollo'

/** Configuración inicial del rancho en este dispositivo: nombre y KMZ con las tablas. */
export function Bienvenida() {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setOcupado(true)
    setError(null)
    try {
      const poligonos = await leerPoligonos(f, f.name)
      await repos.rancho.configurarInicial({ nombre, poligonos })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
      setOcupado(false)
    }
  }

  return (
    <div className="bienvenida">
      <div className="marca">
        <span className="marca-hoja" aria-hidden="true"></span>
        <span className="marca-txt">Monitoreo de Sigatoka negra</span>
      </div>
      <h1>Configura el rancho</h1>
      <p>Escribe el nombre del rancho y carga sus tablas (lotes) con sus polígonos. Después podrás crear recorridos y capturar plantas con el método de Stover modificado.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <label className="campo">
        <span>Nombre del rancho</span>
        <input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: Rancho El Salvador" autoComplete="off" />
      </label>
      <div className="caja" style={{ margin: '18px 0' }}>
        <h2>Tablas del rancho</h2>
        <p className="peq muted">Sube el archivo .kmz o .kml exportado de Google Earth. Cada polígono se convierte en una tabla con su superficie calculada.</p>
        <input ref={archivo} type="file" accept=".kmz,.kml" hidden onChange={(e) => void importar(e)} aria-label="Archivo KMZ o KML" />
        <div className="fila-btn" style={{ marginTop: 10 }}>
          <button className="btn btn-p" type="button" disabled={ocupado || !nombre.trim()} onClick={() => archivo.current?.click()}>
            {ocupado ? 'Importando…' : 'Importar KMZ o KML'}
          </button>
        </div>
        {!nombre.trim() && <p className="peq muted">Escribe primero el nombre del rancho.</p>}
      </div>
      <p className="peq muted">Se crean tres usuarios de prueba: Propietario (administrador), Operador 1 y Operador 2. Esto se reemplaza por inicio de sesión real más adelante.</p>
      <AccesoDesarrollo />
    </div>
  )
}
