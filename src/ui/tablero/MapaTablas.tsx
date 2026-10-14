import { proyectarMapa, semaforo, type Semaforo, type Tabla, type Umbrales } from '@/dominio'
import { fmt } from '../formato'

export const COLOR_SEMAFORO: Record<Semaforo, string> = { verde: 'var(--verde)', amarillo: 'var(--amarillo)', rojo: 'var(--rojo)', sin: 'var(--sin)' }
export const TEXTO_SEMAFORO: Record<Semaforo, string> = { verde: 'Bajo', amarillo: 'Medio', rojo: 'Alto', sin: 'Sin datos' }

export function MapaTablas({ tablas, valores, umbrales, sel, onSel }: { tablas: Tabla[]; valores: Map<string, number | null>; umbrales: Umbrales; sel: string | undefined; onSel: (id: string) => void }) {
  const mapa = proyectarMapa(tablas)
  if (!mapa) return <div className="vacio-panel">Las tablas no tienen polígonos. Importa el KMZ en la pestaña Tablas.</div>
  return (
    <div className="mapa">
      <svg viewBox={`0 0 ${mapa.ancho} ${mapa.alto}`} role="img" aria-label="Mapa de tablas por índice de infección">
        {mapa.poligonos.map(({ tabla, puntos, cx, cy }) => {
          const v = valores.get(tabla.id) ?? null
          const s = semaforo(v, umbrales)
          return (
            <g key={tabla.id}>
              <polygon
                points={puntos}
                fill={COLOR_SEMAFORO[s]}
                fillOpacity={s === 'sin' ? 0.5 : 0.85}
                className={sel === tabla.id ? 'sel' : ''}
                data-tabla={tabla.codigo}
                onClick={() => onSel(tabla.id)}
              >
                <title>{`${tabla.codigo}: II ${fmt(v)}`}</title>
              </polygon>
              <text x={cx} y={cy} textAnchor="middle" fontSize={mapa.letra} fill="var(--ink)">
                {tabla.codigo}
              </text>
              <text x={cx} y={cy + mapa.letra * 1.05} textAnchor="middle" fontSize={mapa.letra * 0.8} fill="var(--ink)">
                {v == null ? '' : fmt(v)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
