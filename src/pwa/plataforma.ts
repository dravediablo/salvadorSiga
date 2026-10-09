/** Detección de plataforma e instalación. Solo lectura del navegador, sin efectos. */

interface NavigatorIOS extends Navigator {
  standalone?: boolean
}

export function estaInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as NavigatorIOS).standalone === true
}

/** iPhone o iPad (iPadOS se presenta como Macintosh con pantalla táctil). */
export function esIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/** Safari de iOS: los demás navegadores de iOS llevan CriOS, FxiOS, EdgiOS, OPiOS, etc. */
export function esSafariIOS(): boolean {
  return esIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|YaBrowser|Brave/.test(navigator.userAgent)
}
