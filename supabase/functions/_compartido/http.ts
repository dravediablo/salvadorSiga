/** Respuestas HTTP comunes de las funciones del servidor. */
const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

export const opciones = (): Response => new Response(null, { status: 204, headers: CABECERAS })

export const json = (cuerpo: unknown, status = 200): Response => new Response(JSON.stringify(cuerpo), { status, headers: CABECERAS })

export const error = (mensaje: string, status = 400, extra: Record<string, unknown> = {}): Response => json({ error: mensaje, ...extra }, status)

export async function leerJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo: unknown = await req.json()
    return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null
  } catch {
    return null
  }
}
