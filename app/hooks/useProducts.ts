'use client';

import { useState, useEffect } from 'react';
import { products as staticProducts, type Product } from '@/app/lib/muragoods-data';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(staticProducts);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/products');
        const json = await res.json();
        if (cancelled) return;
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const dbMap = new Map<string, Partial<Product>>(json.data.map((p: Product) => [p.id, p]));
          setProducts(
            staticProducts.map(p => {
              const dbProduct = dbMap.get(p.id);
              return dbProduct ? { ...p, ...dbProduct } : p;
            }),
          );
        }
      } catch {
        // keep static products on any error
      }
    }

    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { products };
}
