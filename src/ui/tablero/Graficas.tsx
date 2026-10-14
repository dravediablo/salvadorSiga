import { useEffect, useRef, useState } from 'react'
import { escalaNice } from '@/dominio'
import { etiquetaSemana, fmt } from '../formato'

/** Ancho disponible del contenedor, para que el SVG se dibuje a tamaño real y los textos no se deformen. */
function useAncho(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export interface SerieGrafica {
  id: string
  nombre: string
  color: string
  valores: Array<number | null>
  grueso?: boolean
}

export interface MarcadorAplicacion {
  /** Índice de la semana en el eje. */
  i: number
  titulo: string
}

export interface ReferenciaGrafica {
  v: number
  color: string
  etq: string
}

const paso = (n: number, W: number, izq: number) => Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - izq) / 46))))

export function GraficaLineas({
  semanas, series, marcadores = [], alto = 260, sel, onSel, ceroBase = true, refs = [],
}: {
  semanas: string[]
  series: SerieGrafica[]
  marcadores?: MarcadorAplicacion[]
  alto?: number
  sel: number | null
  onSel: (i: number) => void
  ceroBase?: boolean
  refs?: ReferenciaGrafica[]
}) {
  const [ref, ancho] = useAncho()
  const W = Math.max(ancho, 280)
  const H = alto
  const pad = { l: 46, r: 14, t: 16, b: 30 }
  const n = semanas.length
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1))
  const vals = series.flatMap((s) => s.valores).filter((v): v is number => v != null)
  const esc = escalaNice(vals.length ? (ceroBase ? Math.min(0, ...vals) : Math.min(...vals)) : 0, vals.length ? Math.max(...vals, ...refs.map((r) => r.v)) : 1)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - esc.min) / (esc.max - esc.min || 1))
  const cada = paso(n, W, pad.l)
  const colW = n > 1 ? (W - pad.l - pad.r) / (n - 1) : W
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} role="img" aria-label="Serie semanal" style={{ display: 'block', overflow: 'visible' }}>
        {esc.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)">
              {fmt(t, t % 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {refs.map((r, i) => (
          <g key={'r' + i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(r.v)} y2={y(r.v)} stroke={r.color} strokeWidth="2" strokeDasharray="2 4" />
            <text x={W - pad.r} y={y(r.v) - 4} textAnchor="end" fontSize="11" fill={r.color} fontWeight="700">
              {r.etq}
            </text>
          </g>
        ))}
        {semanas.map((s, i) =>
          i % cada === 0 ? (
            <text key={s} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--ink-2)">
              {etiquetaSemana(s)}
            </text>
          ) : null,
        )}
        {marcadores.map((m, k) => (
          <g key={'m' + k}>
            <line x1={x(m.i)} x2={x(m.i)} y1={pad.t} y2={H - pad.b} stroke="var(--ink)" strokeWidth="2" strokeDasharray="5 4" />
            <path d={`M${x(m.i) - 7},${pad.t - 12} h14 l-7,10 z`} fill="var(--ink)">
              <title>{m.titulo}</title>
            </path>
          </g>
        ))}
        {sel != null && sel < n && <line x1={x(sel)} x2={x(sel)} y1={pad.t} y2={H - pad.b} stroke="var(--banana)" strokeWidth="3" />}
        {series.map((s) => {
          const pts = s.valores.flatMap((v, i) => (v == null ? [] : [[x(i), y(v)] as const]))
          if (!pts.length) return null
          return (
            <g key={s.id}>
              <path d={'M' + pts.map((p) => p.join(',')).join(' L')} fill="none" stroke={s.color} strokeWidth={s.grueso ? 4 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, j) => (
                <circle key={j} cx={p[0]} cy={p[1]} r={s.grueso ? 4.5 : 3.2} fill={s.color} />
              ))}
            </g>
          )
        })}
        {/* Columnas transparentes: tocar o pasar el cursor selecciona la semana. */}
        {semanas.map((s, i) => (
          <rect key={'h' + s} x={x(i) - colW / 2} y={pad.t} width={colW} height={H - pad.t - pad.b} fill="transparent" onClick={() => onSel(i)} onMouseEnter={() => onSel(i)} style={{ cursor: 'pointer' }} />
        ))}
      </svg>
    </div>
  )
}

export function GraficaClima({
  semanas, barras, linea, alto = 150, sel, onSel, etqBarras, etqLinea,
}: {
  semanas: string[]
  barras: Array<number | null>
  linea: Array<number | null>
  alto?: number
  sel: number | null
  onSel: (i: number) => void
  etqBarras: string
  etqLinea: string
}) {
  const [ref, ancho] = useAncho()
  const W = Math.max(ancho, 280)
  const H = alto
  const pad = { l: 46, r: 46, t: 12, b: 26 }
  const n = semanas.length
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1))
  const colW = n > 1 ? (W - pad.l - pad.r) / (n - 1) : 40
  const vb = barras.filter((v): v is number => v != null)
  const vl = linea.filter((v): v is number => v != null)
  const eb = escalaNice(0, vb.length ? Math.max(...vb, 1) : 1, 3)
  const el = escalaNice(vl.length ? Math.min(...vl) : 0, vl.length ? Math.max(...vl) : 1, 3)
  const yb = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / (eb.max || 1))
  const yl = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - el.min) / (el.max - el.min || 1))
  const pts = linea.flatMap((v, i) => (v == null ? [] : [[x(i), yl(v)] as const]))
  const cada = paso(n, W, pad.l)
  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Clima semanal" style={{ display: 'block' }}>
        {eb.ticks.map((t) => (
          <g key={'b' + t}>
            <line x1={pad.l} x2={W - pad.r} y1={yb(t)} y2={yb(t)} stroke="var(--line)" />
            <text x={pad.l - 6} y={yb(t) + 4} textAnchor="end" fontSize="11" fill="var(--info)">
              {fmt(t, 0)}
            </text>
          </g>
        ))}
        {el.ticks.map((t) => (
          <text key={'l' + t} x={W - pad.r + 6} y={yl(t) + 4} fontSize="11" fill="var(--s3)">
            {fmt(t, 0)}
          </text>
        ))}
        {barras.map((v, i) =>
          v == null ? null : <rect key={i} x={x(i) - Math.min(colW * 0.32, 14)} width={Math.min(colW * 0.64, 28)} y={yb(v)} height={H - pad.b - yb(v)} fill="var(--info)" opacity="0.55" rx="2" />,
        )}
        {pts.length > 0 && <path d={'M' + pts.map((p) => p.join(',')).join(' L')} fill="none" stroke="var(--s3)" strokeWidth="2.5" />}
        {pts.map((p, j) => (
          <circle key={'c' + j} cx={p[0]} cy={p[1]} r="3" fill="var(--s3)" />
        ))}
        {sel != null && sel < n && <line x1={x(sel)} x2={x(sel)} y1={pad.t} y2={H - pad.b} stroke="var(--banana)" strokeWidth="3" />}
        {semanas.map((s, i) =>
          i % cada === 0 ? (
            <text key={s} x={x(i)} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--ink-2)">
              {etiquetaSemana(s)}
            </text>
          ) : null,
        )}
        {semanas.map((s, i) => (
          <rect key={'h' + s} x={x(i) - colW / 2} y={pad.t} width={colW} height={H - pad.t - pad.b} fill="transparent" onClick={() => onSel(i)} onMouseEnter={() => onSel(i)} />
        ))}
      </svg>
      <div className="leyenda">
        <span>
          <i className="sem" style={{ background: 'var(--info)', opacity: 0.55, borderRadius: 3 }}></i>
          {etqBarras} (eje izq.)
        </span>
        <span>
          <i className="sem" style={{ background: 'var(--s3)' }}></i>
          {etqLinea} (eje der.)
        </span>
      </div>
    </div>
  )
}
