'use client';

import { useState, useEffect } from 'react';
import { products as staticProducts, type Product, type InventoryStatus } from '@/app/lib/muragoods-data';

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
          const dbMap = new Map<string, { inventory: InventoryStatus }>(json.data.map((p: { id: string; inventory: InventoryStatus }) => [p.id, { inventory: p.inventory }]));
          setProducts(
            staticProducts.map(p => {
              const dbFields = dbMap.get(p.id);
              return dbFields ? { ...p, ...dbFields } : p;
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
