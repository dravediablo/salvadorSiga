import { parseKml, type PoligonoKml } from '@/dominio'

type Fuente = Blob | ArrayBuffer | Uint8Array

async function aBytes(f: Fuente): Promise<Uint8Array> {
  if (f instanceof Uint8Array) return f
  if (f instanceof ArrayBuffer) return new Uint8Array(f)
  if (typeof f.arrayBuffer === 'function') return new Uint8Array(await f.arrayBuffer())
  return new Uint8Array(await new Response(f).arrayBuffer())
}

/**
 * Lee un KMZ (zip con un KML) o un KML suelto y devuelve sus polígonos.
 * `nombre` decide el formato por la extensión. Los errores vienen en español.
 */
export async function leerPoligonos(archivo: Fuente, nombre: string): Promise<PoligonoKml[]> {
  const bytes = await aBytes(archivo)
  if (/\.kmz$/i.test(nombre)) {
    // JSZip se carga solo cuando se importa un KMZ, para no pesar en el arranque de la app.
    const { default: JSZip } = await import('jszip')
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
    try {
      zip = await JSZip.loadAsync(bytes)
    } catch {
      throw new Error('El archivo KMZ está dañado o no es un KMZ. Expórtalo de nuevo desde Google Earth.')
    }
    const kmls = Object.values(zip.files).filter((f) => !f.dir && /\.kml$/i.test(f.name))
    // Google Earth guarda el principal como doc.kml.
    const kml = kmls.find((f) => /(^|\/)doc\.kml$/i.test(f.name)) ?? kmls[0]
    if (!kml) throw new Error('El KMZ no contiene un archivo KML.')
    return parseKml(await kml.async('string'))
  }
  return parseKml(new TextDecoder('utf-8').decode(bytes))
}
