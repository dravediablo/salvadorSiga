import { useEffect, useState } from 'react'

export function useConexion(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  useEffect(() => {
    const a = () => setEnLinea(true)
    const b = () => setEnLinea(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => {
      window.removeEventListener('online', a)
      window.removeEventListener('offline', b)
    }
  }, [])
  return enLinea
}
