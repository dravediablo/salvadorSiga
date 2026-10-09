import { ordenarTablas, type Hoja, type Planta, type Recorrido, type Tabla } from '@/dominio'
import { IconoAtras } from '../iconos'

export function Stepper({ valor, min = 0, max = 99, onCambio, etiqueta }: { valor: number; min?: number; max?: number; onCambio: (n: number) => void; etiqueta: string }) {
  return (
    <div className="stepper" role="group" aria-label={etiqueta}>
      <button type="button" aria-label={'Restar ' + etiqueta} onClick={() => onCambio(Math.max(min, valor - 1))} disabled={valor <= min}>
        −
      </button>
      <output className="num" aria-label={etiqueta + ' actual'}>
        {valor}
      </output>
      <button type="button" aria-label={'Sumar ' + etiqueta} onClick={() => onCambio(Math.min(max, valor + 1))} disabled={valor >= max}>
        +
      </button>
    </div>
  )
}

/** Fichas "No presenta", 1…TH para la hoja más joven con un síntoma. */
export function SelectorHoja({ titulo, valor, th, onCambio }: { titulo: string; valor: number | null; th: number; onCambio: (n: number) => void }) {
  const n = Math.max(th, valor ?? 0)
  return (
    <div className="sintoma" role="group" aria-label={titulo}>
      <div className="cab">
        <span style={{ fontWeight: 700 }}>{titulo}</span>
        <span className="peq" style={{ color: valor == null ? 'var(--aviso)' : 'var(--ink-2)', fontWeight: 700 }}>
          {valor == null ? 'Sin capturar' : valor === 0 ? 'No presenta' : 'Hoja ' + valor}
        </span>
      </div>
      <div className="chips">
        <button type="button" className={'chip np' + (valor === 0 ? ' activo' : '')} aria-pressed={valor === 0} onClick={() => onCambio(0)}>
          No presenta
        </button>
        {Array.from({ length: n }, (_, i) => i + 1).map((h) => (
          <button
            key={h}
            type="button"
            className={'chip num' + (valor === h ? ' activo' : '')}
            aria-pressed={valor === h}
            aria-label={`${titulo}: hoja ${h}`}
            style={h > th ? { borderColor: 'var(--error)', color: 'var(--error)' } : undefined}
            onClick={() => onCambio(h)}
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TiraHojas({ hojas }: { hojas: Hoja[] }) {
  return (
    <div className="tira">
      {hojas.map((h) => (
        <span key={h.id} className={'cuad ' + (h.grado_gauhl == null ? 'vacio' : 'gc' + h.grado_gauhl)} title={'Hoja ' + h.numero_hoja}>
          {h.grado_gauhl == null ? h.numero_hoja : h.grado_gauhl}
        </span>
      ))}
    </div>
  )
}

export function SelectorTablas({ tablas, sel, onCambio, deshabilitadas = [] }: { tablas: Tabla[]; sel: string[]; onCambio: (ids: string[]) => void; deshabilitadas?: string[] }) {
  return (
    <div className="chips">
      {ordenarTablas(tablas).map((t) => {
        const on = sel.includes(t.id)
        return (
          <button
            key={t.id}
            type="button"
            disabled={deshabilitadas.includes(t.id)}
            className={'chip chip-tabla' + (on ? ' activo' : '')}
            aria-pressed={on}
            onClick={() => onCambio(on ? sel.filter((x) => x !== t.id) : [...sel, t.id])}
          >
            {t.codigo}
          </button>
        )
      })}
    </div>
  )
}

export function EtqEstado({ estado }: { estado: Recorrido['estado'] }) {
  return estado === 'en_curso' ? <span className="etq e-curso">En curso</span> : <span className="etq e-cerrado">Cerrado, por enviar</span>
}

export function Migas({ onVolver, children }: { onVolver: () => void; children: React.ReactNode }) {
  return (
    <div className="migas">
      <button className="volver" type="button" onClick={onVolver}>
        <IconoAtras />
        {children}
      </button>
    </div>
  )
}

export function Faltante({ texto, onVolver }: { texto: string; onVolver: () => void }) {
  return (
    <div>
      <p>{texto}</p>
      <button className="btn" type="button" onClick={onVolver}>
        Volver a recorridos
      </button>
    </div>
  )
}

export type { Planta }
