import { useEffect, useRef, useState } from 'react'
import { GRADOS_GAUHL, hf, iiPlanta, type GradoGauhl, type Hoja, type Planta } from '@/dominio'
import { fmt } from '../formato'
import { IconoAtras } from '../iconos'

interface Props {
  planta: Planta
  hojas: Hoja[]
  codigoTabla: string
  /** Guarda el grado en segundo plano (la interfaz no espera). */
  onGrado: (hoja: Hoja, grado: GradoGauhl) => void
  onCerrar: () => void
}

/**
 * Calificación hoja por hoja. El grado se refleja al instante en una copia local
 * y se manda a guardar en segundo plano: el operador avanza sin esperar a IndexedDB.
 */
export function ModalHojas({ planta, hojas, codigoTabla, onGrado, onCerrar }: Props) {
  const [locales, setLocales] = useState<Record<string, GradoGauhl>>({})
  const gradoDe = (h: Hoja): GradoGauhl | null => locales[h.id] ?? h.grado_gauhl
  const efectivas = hojas.map((h) => ({ ...h, grado_gauhl: gradoDe(h) }))

  const primeraVacia = hojas.findIndex((h) => h.grado_gauhl == null)
  const [i, setI] = useState(primeraVacia >= 0 ? primeraVacia : 0)
  const [fin, setFin] = useState(false)
  const lista = useRef<HTMLDivElement>(null)
  const total = hojas.length
  const hoja = efectivas[i]

  useEffect(() => {
    lista.current?.querySelector('.actual')?.scrollIntoView({ block: 'nearest' })
  }, [i])

  function elegir(g: GradoGauhl) {
    const h = hojas[i]
    if (!h) return
    setLocales((l) => ({ ...l, [h.id]: g }))
    onGrado(h, g)
    const siguiente = efectivas.findIndex((x, j) => j > i && x.grado_gauhl == null)
    if (i < total - 1) setI(siguiente > i ? siguiente : i + 1)
    else setFin(true)
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^[0-6]$/.test(e.key)) elegir(Number(e.key) as GradoGauhl)
      else if (e.key === 'ArrowUp') setI(Math.max(0, i - 1))
      else if (e.key === 'ArrowDown') setI(Math.min(total - 1, i + 1))
      else if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const hfV = hf(efectivas)
  const iiV = iiPlanta(efectivas)
  const faltan = efectivas.filter((h) => h.grado_gauhl == null).length

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Calificar hojas">
      <div className="modal-cab">
        <button className="volver" type="button" onClick={onCerrar}>
          <IconoAtras />
          Planta {planta.numero_planta}
        </button>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>
            Hoja {hoja ? hoja.numero_hoja : '—'} de {total}
          </div>
          <div className="peq muted">
            {codigoTabla}: HF {hfV}, II {fmt(iiV)}
            {faltan ? `, faltan ${faltan}` : ''}
          </div>
        </div>
      </div>
      <div className="modal-cuerpo" ref={lista}>
        <p className="peq muted" style={{ textAlign: 'center', margin: '0 0 8px' }}>
          Hoja 1 = la más joven completamente abierta (sin contar el cigarro)
        </p>
        <div className="planta">
          {efectivas.map((h, j) => (
            <button
              key={h.id}
              type="button"
              className={'hoja-f ' + (j % 2 ? 'der' : 'izq') + (j === i && !fin ? ' actual' : '')}
              onClick={() => {
                setI(j)
                setFin(false)
              }}
              aria-label={`Hoja ${h.numero_hoja}, ${h.grado_gauhl == null ? 'sin calificar' : 'grado ' + h.grado_gauhl}`}
            >
              <span className={'lam ' + (h.grado_gauhl == null ? 'vacia' : 'gc' + h.grado_gauhl)}></span>
              <span className="n num">
                {h.numero_hoja}
                {h.grado_gauhl != null ? '·' + h.grado_gauhl : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="modal-pie">
        {fin ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>{faltan ? `Faltan ${faltan} hoja(s) por calificar` : 'Todas las hojas calificadas'}</p>
            <p className="muted">
              Hojas funcionales: <b>{hfV}</b> · Índice de infección: <b>{fmt(iiV)} %</b>
            </p>
            <div className="fila-btn">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setFin(false)
                  setI(total - 1)
                }}
              >
                Revisar hojas
              </button>
              <button className="btn btn-p" type="button" onClick={onCerrar}>
                Volver a la planta
              </button>
            </div>
          </div>
        ) : (
          <div className="grados">
            {GRADOS_GAUHL.map((g) => (
              <button
                key={g.grado}
                type="button"
                className={'grado gc' + g.grado + (hoja && hoja.grado_gauhl === g.grado ? ' sel' : '')}
                onClick={() => elegir(g.grado)}
                aria-label={`Grado ${g.grado}: ${g.severidad}`}
              >
                <b>{g.grado}</b>
                <small>{g.severidad}</small>
              </button>
            ))}
            <button
              className="grado"
              type="button"
              style={{ background: 'var(--bg)', color: 'var(--ink)', borderColor: 'var(--ink)' }}
              disabled={i === 0}
              onClick={() => setI(i - 1)}
              aria-label="Hoja anterior"
            >
              <b style={{ fontSize: '1.3rem' }}>↑</b>
              <small>Hoja anterior</small>
            </button>
            <div className="sep-func">
              <span>0–4 funcionales</span>
              <span>5–6 no funcionales</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
