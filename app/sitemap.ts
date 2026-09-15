import type { MetadataRoute } from 'next';

// Sitemap for search engines. The base URL follows VERCEL_URL in production
// (muragoods.vercel.app) so absolute lastModified references stay valid.
const BASE = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://muragoods.vercel.app');

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, priority: 1, changeFrequency: 'weekly', lastModified: now },
    { url: `${BASE}/hub`, priority: 0.8, changeFrequency: 'weekly', lastModified: now },
    // MuraStream — the streaming surface.
    { url: `${BASE}/murastream`, priority: 1, changeFrequency: 'daily', lastModified: now },
    { url: `${BASE}/murastream/search`, priority: 0.9, changeFrequency: 'daily', lastModified: now },
    { url: `${BASE}/murastream/genres`, priority: 0.9, changeFrequency: 'daily', lastModified: now },
    { url: `${BASE}/murastream/kdrama`, priority: 0.9, changeFrequency: 'daily', lastModified: now },
    { url: `${BASE}/murastream/history`, priority: 0.3, changeFrequency: 'weekly', lastModified: now },
  ];

  return staticRoutes;
}
