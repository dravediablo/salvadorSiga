/**
 * Comprobación de tipos (la compila `npm run typecheck`): cada entidad de `src/dominio/tipos.ts`
 * debe coincidir, campo por campo y tipo por tipo, con la fila generada por Supabase
 * (`tipos.gen.ts`). Si el esquema de Postgres y el dominio se separan, esto deja de compilar.
 *
 * Las únicas diferencias admitidas están listadas abajo con su motivo, y se comprueba que cada
 * una siga existiendo (si desaparece, hay que quitarla de la lista). No se oculta nada con casts.
 */
import type { Aplicacion, ClimaDiario, EvaluacionTabla, Hoja, Membresia, Planta, PlantaMarcada, Rancho, Recorrido, Tabla, Usuario } from '@/dominio'
import type { Database } from './tipos.gen'

type Filas = Database['public']['Tables']

/** Campos cuyo tipo no es idéntico en el dominio y en la fila, o que sobran/faltan en uno de los dos. */
type Diferencias<D, F> = {
  [K in keyof D | keyof F]: K extends keyof D
    ? K extends keyof F
      ? [D[K]] extends [F[K]]
        ? [F[K]] extends [D[K]]
          ? never
          : K
        : K
      : K
    : K
}[keyof D | keyof F]

/**
 * Diferencias conocidas, comunes a todas las entidades:
 * - `server_updated_at`: en el dominio es `string | null` (vacío hasta sincronizar); en Postgres es `not null`.
 *
 * Diferencias por entidad (Postgres guarda `text` con CHECK, que el generador tipa como `string`;
 * el dominio usa uniones de literales):
 * - `rol`, `estado`, `tipo`, `origen`: `'a' | 'b'` en el dominio, `string` en la fila.
 * - `grado_gauhl`: `0 | 1 | … | 6 | null` en el dominio, `number | null` en la fila (smallint con CHECK).
 * - `geometria`: `Poligono | null` en el dominio, `Json` en la fila (jsonb con CHECK de tipo Polygon).
 */
type Conocidas<D, F, E extends PropertyKey> = [Exclude<Diferencias<D, F>, E>] extends [never] ? ([E] extends [Diferencias<D, F>] ? true : 'sobra una excepción') : Exclude<Diferencias<D, F>, E>

/** Solo compila si el argumento es `true`. */
type Afirmar<T extends true> = T

export type EntidadesCoinciden = [
  Afirmar<Conocidas<Rancho, Filas['rancho']['Row'], 'server_updated_at'>>,
  Afirmar<Conocidas<Usuario, Filas['usuario']['Row'], 'server_updated_at'>>,
  Afirmar<Conocidas<Membresia, Filas['membresia']['Row'], 'server_updated_at' | 'rol'>>,
  Afirmar<Conocidas<Tabla, Filas['tabla']['Row'], 'server_updated_at' | 'origen' | 'geometria'>>,
  Afirmar<Conocidas<Recorrido, Filas['recorrido']['Row'], 'server_updated_at' | 'estado'>>,
  Afirmar<Conocidas<EvaluacionTabla, Filas['evaluacion_tabla']['Row'], 'server_updated_at' | 'tipo'>>,
  Afirmar<Conocidas<Planta, Filas['planta']['Row'], 'server_updated_at'>>,
  Afirmar<Conocidas<Hoja, Filas['hoja']['Row'], 'server_updated_at' | 'grado_gauhl'>>,
  Afirmar<Conocidas<Aplicacion, Filas['aplicacion']['Row'], 'server_updated_at'>>,
  Afirmar<Conocidas<ClimaDiario, Filas['clima_diario']['Row'], 'server_updated_at'>>,
  Afirmar<Conocidas<PlantaMarcada, Filas['planta_marcada']['Row'], 'server_updated_at'>>,
]
