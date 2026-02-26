import type { MetadataRoute } from 'next'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://whopaintedthis.vercel.app').replace(/\/+$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${APP_BASE_URL}/sitemap.xml`,
    host: APP_BASE_URL,
  }
}
