export type ZoneKey = "DWCL" | "Daraga" | "Custom";
export type InventoryStatus = "In Stock" | "Out of Stock" | "Pre-Order Only";
export type OrderStatus =
  | "Pending Payment"
  | "Payment Verified"
  | "Preparing"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled";

export type DeliveryService = "Free Shipping" | "Saturday Delivery" | "Grab Express" | "Same-Day Express" | "Nationwide Shipping";

export type ProductVariant = {
  id: string;
  name: string;
  price: number;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  badge: string;
  color: string;
  availability: ZoneKey[];
  inventory: InventoryStatus;
  variants: ProductVariant[];
  icon: string;
  image: string;
};

export type CartItem = Product & {
  quantity: number;
  selectedVariant?: ProductVariant;
};

export type Order = {
  id: string;
  customer: string;
  phone: string;
  zone: ZoneKey;
  address: string;
  latitude?: number;
  longitude?: number;
  payment: "InstaPay" | "Cash on Delivery";
  instaPayRefNumber?: string;
  instaPayScreenshotUrl?: string;
  /** @deprecated Legacy field — use instaPayRefNumber */
  gcashRefNumber?: string;
  /** @deprecated Legacy field — use instaPayScreenshotUrl */
  gcashScreenshotUrl?: string;
  deliveryDate: string;
  status: OrderStatus;
  total: number;
  items: string[];
  deliveryType: DeliveryService;
  createdAt: string;
  userId?: string;
  confirmedAddress?: string;
  pointsEarned?: number;
};

export const adminEmails = ["muragoods0@gmail.com", "mhaxthedog@gmail.com"];

export const adminCredentials = {
  email: "mhaxthedog@gmail.com",
  password: "Jesusmaryosepcasiram",
};

export const products: Product[] = [
  {
    id: "cookies",
    name: "Cookies",
    description: "Freshly baked cookies for a warm, sweet bite.",
    category: "Coffee Jelly & Cookies",
    badge: "Order Now",
    color: "from-pink-200 via-red-100 to-yellow-100",
    availability: ["DWCL"],
    inventory: "In Stock",
    icon: "COOKIES",
    image: "/images/product-cookies.png",
    variants: [
      { id: "regular", name: "Regular Cookie", price: 25 },
      { id: "cream", name: "Cookies and Cream", price: 30 },
    ],
  },
  {
    id: "coffee-jelly",
    name: "Coffee Jelly",
    description: "Creamy coffee treat with a smooth, chilled finish.",
    category: "Coffee Jelly & Cookies",
    badge: "Order Now",
    color: "from-rose-200 via-violet-100 to-fuchsia-200",
    availability: ["DWCL"],
    inventory: "In Stock",
    icon: "COFFEE",
    image: "/images/product-coffee-jelly.png",
    variants: [
      { id: "option1", name: "Option 1", price: 15 },
      { id: "option2", name: "Option 2", price: 20 },
    ],
  },
  {
    id: "musubi",
    name: "Musubi",
    description: "Savory Japanese-inspired rice snack with a tasty filling.",
    category: "Musubi & Churros",
    badge: "Order Now",
    color: "from-amber-200 via-yellow-100 to-orange-200",
    availability: ["DWCL", "Daraga", "Custom"],
    inventory: "In Stock",
    icon: "MUSUBI",
    image: "/images/product-musubi.png",
    variants: [
      { id: "regular", name: "Regular Musubi", price: 40 },
      { id: "egg", name: "With Egg", price: 45 },
      { id: "flakes", name: "With Flakes", price: 50 },
    ],
  },
  {
    id: "churros",
    name: "Mini Churros",
    description: "Golden, crunchy, and dusted with sweet cinnamon sugar.",
    category: "Musubi & Churros",
    badge: "Pre-Order Now",
    color: "from-orange-200 via-amber-100 to-yellow-200",
    availability: ["DWCL", "Daraga", "Custom"],
    inventory: "Pre-Order Only",
    icon: "CHURROS",
    image: "/images/product-churros.png",
    variants: [
      { id: "option1", name: "Option 1", price: 70 },
      { id: "option2", name: "Option 2", price: 100 },
    ],
  },
];export const deliveryZones = [
  {
    code: "DWCL",
    label: "DWCL Campus Pickup",
    fee: 0,
    note: "All menu items available. Free pickup.",
    eligible: ["cookies", "coffee-jelly", "musubi", "churros"],
  },
  {
    code: "Daraga",
    label: "Daraga / Legazpi Delivery",
    fee: 30,
    note: "Fixed ₱30 delivery fee within Daraga and Legazpi areas. Free shipping on orders ₱200+.",
    eligible: ["musubi", "churros"],
  },
  {
    code: "Custom",
    label: "Custom Delivery (Outside DWCL)",
    fee: 0,
    note: "Delivery fee & schedule discussed via Instagram DM. Within the day, Mon-Fri, or Sunday.",
    eligible: ["musubi", "churros"],
  },
] as const;

export const mockOrders: Order[] = [];

export const dwclOnlyProducts: string[] = ['cookies', 'coffee-jelly'];

/** Points earned per peso spent */
export const POINTS_PER_PESO = 0.5;

/** Calculate points earned for an order total */
export function calculatePoints(total: number): number {
  return Math.floor(total * POINTS_PER_PESO);
}

/** Delivery service options per zone */
export const deliveryServiceOptions: Record<string, string[]> = {
  DWCL: ["DWCL Pickup — Free"],
  Daraga: ["Daraga/Legazpi — ₱30", "Grab Express", "Same-Day Delivery"],
  Custom: ["Custom Delivery — Message @muragoods_"],
};
