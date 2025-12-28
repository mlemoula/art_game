export const IMAGE_PROXY_PATH = '/api/image'

const encodeBase64Url = (value: string) => {
  if (!value) return ''
  let base64 = ''
  if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
    base64 = globalThis.btoa(unescape(encodeURIComponent(value)))
  } else if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(value, 'utf8').toString('base64')
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getProxiedImageUrl(src: string, width?: number) {
  if (!src) return ''
  const encoded = encodeBase64Url(src)
  if (!encoded) return ''
  const segments = [encoded]
  const sanitizedWidth =
    typeof width === 'number' && !Number.isNaN(width) && width > 0
      ? Math.round(width)
      : undefined
  if (sanitizedWidth) {
    segments.unshift(`w${sanitizedWidth}`)
  }
  return `${IMAGE_PROXY_PATH}/${segments.join('/')}`
}
