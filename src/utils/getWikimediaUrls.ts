export interface WikimediaUrls {
  thumb: string
  medium: string
  hd: string
}

/**
 * Génère les URLs thumbnail, medium et HD pour une image Wikimedia.
 * 
 * @param imageUrl - URL complète de l'image Wikimedia originale
 * @param thumbWidth - largeur de la thumbnail (par défaut 800px)
 * @param mediumWidth - largeur de l'image medium (par défaut 1200px)
 * @returns {WikimediaUrls} - objet avec thumb, medium et hd
 */
export function getWikimediaUrls(
  imageUrl: string,
  thumbWidth = 480,
  mediumWidth = 1200
): WikimediaUrls {
  if (!imageUrl) {
    return { thumb: '', medium: '', hd: '' }
  }

  try {
    const url = new URL(imageUrl)
    const segments = url.pathname.split('/').filter(Boolean)
    const commonsIndex = segments.indexOf('commons')
    if (commonsIndex === -1 || commonsIndex === segments.length - 1) {
      return { thumb: imageUrl, medium: imageUrl, hd: imageUrl }
    }

    const relativeSegments = segments.slice(commonsIndex + 1)
    const fileName = relativeSegments[relativeSegments.length - 1]
    if (!fileName) {
      return { thumb: imageUrl, medium: imageUrl, hd: imageUrl }
    }

    const thumbPath = [
      ...segments.slice(0, commonsIndex + 1),
      'thumb',
      ...relativeSegments,
    ].join('/')

    const base = `${url.origin}/${thumbPath}`
    const thumb = `${base}/${thumbWidth}px-${fileName}`
    const medium = `${base}/${mediumWidth}px-${fileName}`
    const hd = imageUrl

    return { thumb, medium, hd }
  } catch {
    return { thumb: imageUrl, medium: imageUrl, hd: imageUrl }
  }
}
