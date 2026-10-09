import { useLiveQuery } from 'dexie-react-hooks'
import { consultas, type UsuarioActual } from '@/datos'
import { puedeVerRecorrido, type ActorPermisos } from '@/dominio'
import { useNavegacion } from '../navegacion'
import { ListaRecorridos } from './ListaRecorridos'
import { NuevoRecorrido } from './NuevoRecorrido'
import { VistaPlanta } from './VistaPlanta'
import { VistaRecorrido } from './VistaRecorrido'
import { VistaTabla } from './VistaTabla'

export function Campo({ actual, irAInstalar }: { actual: UsuarioActual; irAInstalar: () => void }) {
  const { nav, ir } = useNavegacion()
  const actor: ActorPermisos = { usuario_id: actual.usuario.id, rol: actual.membresia.rol }
  // Al abrir la app o cambiar de usuario, si el recorrido guardado ya no es accesible se vuelve a la lista.
  const acceso = useLiveQuery(
    async () => {
      if (!nav?.recorridoId) return true
      const d = await consultas.detalleRecorrido(nav.recorridoId)
      return !!d && puedeVerRecorrido({ usuario_id: actual.usuario.id, rol: actual.membresia.rol }, d.recorrido)
    },
    [nav?.recorridoId, actual.usuario.id, actual.membresia.rol],
  )

  if (!nav || acceso === undefined) return <div className="cargando">Cargando…</div>
  const n = acceso ? nav : { vista: 'lista' as const }

  if (n.vista === 'nuevo') {
    return <NuevoRecorrido ranchoId={actual.membresia.rancho_id} usuarioId={actual.usuario.id} operador={actual.usuario.nombre} ir={ir} />
  }
  if (n.vista === 'recorrido' && n.recorridoId) return <VistaRecorrido actor={actor} recorridoId={n.recorridoId} ir={ir} />
  if (n.vista === 'tabla') return <VistaTabla actor={actor} nav={n} ir={ir} />
  if (n.vista === 'planta') return <VistaPlanta actor={actor} nav={n} ir={ir} />
  return <ListaRecorridos actor={actor} ir={ir} irAInstalar={irAInstalar} />
}
