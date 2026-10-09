const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const }

export const IconoCampo = () => (
  <svg {...base} aria-hidden="true">
    <path d="M12 22V9" />
    <path d="M12 13C7 13 4 10 4 5c5 0 8 3 8 8z" />
    <path d="M12 10c0-4 3-7 8-7 0 5-3 8-8 8" />
  </svg>
)
export const IconoTablas = () => (
  <svg {...base} aria-hidden="true">
    <path d="M3 5h18v14H3zM3 12h18M9 5v14M15 5v14" />
  </svg>
)
export const IconoEstado = () => (
  <svg {...base} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </svg>
)
export const IconoAtras = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
