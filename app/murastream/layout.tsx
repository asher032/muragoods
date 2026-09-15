import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import MuraStreamLayoutWrapper from './MuraStreamLayoutClient';

// Server metadata shell — `export const metadata` must live in a server
// component, so this file carries the SEO block and renders the existing
// client-side layout wrapper below it.

export const metadata: Metadata = {
  title: {
    default: 'MuraStream — Stream Movies, TV Shows & Dramas Free',
    template: '%s | MuraStream',
  },
  description:
    'MuraStream by Muragoods: stream trending movies, TV shows, cartoons and K-Dramas with trailers, watch parties and a full TMDB catalog.',
  keywords: [
    'MuraStream', 'watch movies online', 'free streaming', 'TV shows',
    'K-Drama', 'cartoons', 'watch party', 'trailers', 'Muragoods',
  ],
  openGraph: {
    title: 'MuraStream — Stream Movies, TV Shows & Dramas',
    description:
      'Trending movies, TV, cartoons and dramas with trailers and watch parties.',
    siteName: 'Muragoods',
    type: 'website',
    url: 'https://muragoods.vercel.app/murastream',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MuraStream — Stream Movies, TV Shows & Dramas',
    description: 'Trending movies, TV, cartoons and dramas with trailers and watch parties.',
  },
  alternates: {
    canonical: 'https://muragoods.vercel.app/murastream',
  },
};

export default function MuraStreamServerLayout({ children }: { children: ReactNode }) {
  return <MuraStreamLayoutWrapper>{children}</MuraStreamLayoutWrapper>;
}
