// Genera los PNG de public/ a partir de los SVG. Uso: node scripts/iconos.mjs
import sharp from 'sharp'

const hacer = (svg, tam, salida) => sharp(`public/${svg}`, { density: 384 }).resize(tam, tam).png().toFile(`public/${salida}`)

await Promise.all([
  hacer('icono.svg', 192, 'icon-192.png'),
  hacer('icono.svg', 512, 'icon-512.png'),
  hacer('icono-maskable.svg', 512, 'icon-512-maskable.png'),
  hacer('icono.svg', 180, 'apple-touch-icon.png'),
])
console.log('Íconos generados en public/')
