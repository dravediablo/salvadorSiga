// Genera src/datos/__fixtures__/sintetico.kmz: un KMZ inventado de 3 polígonos para las pruebas.
// No contiene datos reales de ningún productor. Uso: node scripts/generar-kmz-sintetico.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'

// [nombre, lon0, lat0, ancho°, alto°] — rectángulos inventados cerca de (-103.50, 18.50).
const lotes = [
  ['Tabla 1. Sup. 6.8 ha.', -103.5, 18.5, 0.003, 0.0021],
  ['tabla 2. Sup. 5.1 ha.', -103.4965, 18.5, 0.0025, 0.0019],
  ['Tabla 2A Buffer 0.30', -103.4965, 18.4975, 0.0008, 0.0035],
]

const anillo = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y - h], [x, y - h], [x, y]].map(([a, b]) => `${a},${b},0`).join(' ')

const placemarks = lotes
  .map(
    ([nombre, x, y, w, h]) => `
		<Placemark>
			<name>${nombre}</name>
			<styleUrl>#estilo</styleUrl>
			<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${anillo(x, y, w, h)}</coordinates></LinearRing></outerBoundaryIs></Polygon>
		</Placemark>`,
  )
  .join('')

const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
	<name>Rancho sintético</name>
	<Style id="estilo"><LineStyle><color>ff00ffff</color></LineStyle></Style>
	<Folder>
		<name>Tablas</name>${placemarks}
	</Folder>
</Document>
</kml>
`

const zip = new JSZip()
zip.file('doc.kml', kml)
mkdirSync('src/datos/__fixtures__', { recursive: true })
// Fecha fija para que el archivo sea reproducible byte a byte.
writeFileSync('src/datos/__fixtures__/sintetico.kmz', await zip.file('doc.kml', kml, { date: new Date(Date.UTC(2026, 0, 1)) }).generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('KMZ sintético generado')
