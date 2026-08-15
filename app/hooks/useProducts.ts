'use client';

import { useState, useEffect } from 'react';
import { products, type Product } from '@/app/lib/muragoods-data';

export function useProducts() {
  const [data, setData] = useState<Product[]>(products);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/products');
        const json = await res.json();
        if (cancelled) return;
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const dbMap = new Map<string, Product>(json.data.map((p: Product) => [p.id, p]));
          const merged = products.map(p => {
            const dbProduct = dbMap.get(p.id);
            return dbProduct ? { ...p, ...dbProduct } : p;
          });
          setData(merged);
        } else {
          setData(products);
        }
      } catch {
        if (!cancelled) setData(products);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { products: data, loading };
}
