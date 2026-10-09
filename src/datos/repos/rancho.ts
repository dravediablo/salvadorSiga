import { nuevaMembresia, nuevaTabla, nuevoRancho, planearImportacion, type Membresia, type PoligonoKml, type Rancho, type Rol, type Usuario } from '@/dominio'
import { escribir, guardar, guardarVarios } from '../cola'
import type { SigatokaDB } from '../db'

const ahora = (): string => new Date().toISOString()

/** Usuarios de prueba que se crean con el rancho local (se reemplazan por inicio de sesión real en el hito 5). */
const USUARIOS_PRUEBA: ReadonlyArray<{ nombre: string; rol: Rol }> = [
  { nombre: 'Propietario', rol: 'administrador' },
  { nombre: 'Operador 1', rol: 'operador' },
  { nombre: 'Operador 2', rol: 'operador' },
]

export function crearRepoRancho(db: SigatokaDB) {
  return {
    /**
     * Configuración inicial del dispositivo: rancho, tres usuarios de prueba con sus
     * membresías y las tablas del KMZ, todo en una transacción.
     */
    configurarInicial(p: { nombre: string; poligonos: readonly PoligonoKml[] }): Promise<{ rancho: Rancho; usuarios: Usuario[]; membresias: Membresia[] }> {
      return escribir(db, async () => {
        if ((await db.ranchos.count()) > 0) throw new Error('Este dispositivo ya tiene un rancho configurado.')
        const nombre = p.nombre.trim()
        if (!nombre) throw new Error('Escribe el nombre del rancho.')
        const rancho = await guardar(db, 'ranchos', nuevoRancho({ nombre }))
        const t = ahora()
        const usuarios = await guardarVarios(
          db,
          'usuarios',
          USUARIOS_PRUEBA.map((u) => ({
            id: crypto.randomUUID(), nombre: u.nombre, email: '', created_at: t, updated_at: t, server_updated_at: null, eliminado: false,
          })),
        )
        const membresias = await guardarVarios(
          db,
          'membresias',
          usuarios.map((u, i) => nuevaMembresia({ rancho_id: rancho.id, usuario_id: u.id, rol: USUARIOS_PRUEBA[i].rol })),
        )
        const plan = planearImportacion([], p.poligonos, { desactivarFaltantes: false })
        await guardarVarios(
          db,
          'tablas',
          plan.nuevas.map((x) =>
            nuevaTabla({ rancho_id: rancho.id, codigo: x.codigo, nombre: x.nombre, superficie_ha: x.superficie_ha, geometria: x.geometria, origen: 'kmz', activa: !x.buffer }),
          ),
        )
        return { rancho, usuarios, membresias }
      })
    },

  }
}

export type RepoRancho = ReturnType<typeof crearRepoRancho>
