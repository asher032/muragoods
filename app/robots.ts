import type { MetadataRoute } from 'next';

// Allow all public crawlers; admin/API surfaces are disallowed.
const BASE = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://muragoods.vercel.app');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/murastream/watch', '/account'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
