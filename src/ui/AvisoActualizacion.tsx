interface Props {
  onActualizar: () => void
  onCerrar: () => void
}

export function AvisoActualizacion({ onActualizar, onCerrar }: Props) {
  return (
    <div className="banda-actualizacion" role="status">
      <strong>Hay una versión nueva</strong>
      <div className="fila-btn">
        <button className="btn btn-p btn-s" type="button" onClick={onActualizar}>
          Actualizar ahora
        </button>
        <button className="btn btn-q btn-s" type="button" onClick={onCerrar}>
          Más tarde
        </button>
      </div>
    </div>
  )
}
