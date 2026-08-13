export type ZoneKey = "DWCL" | "Legazpi" | "Daraga" | "Outside";
export type InventoryStatus = "In Stock" | "Out of Stock" | "Pre-Order Only";
export type OrderStatus =
  | "Pending Payment"
  | "Payment Verified"
  | "Preparing"
  | "Out for Delivery"
  | "Delivered";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  badge: string;
  color: string;
  availability: ZoneKey[];
  inventory: InventoryStatus;
};

export type Order = {
  id: string;
  customer: string;
  phone: string;
  zone: ZoneKey;
  address: string;
  payment: "GCash" | "Cash on Delivery";
  status: OrderStatus;
  total: number;
  items: string[];
  deliveryType: "Free Shipping" | "Saturday Delivery" | "Grab Express";
};

export const adminCredentials = {
  email: "admin@muragoods.test",
  password: "muragoods123",
};

export const products: Product[] = [
  {
    id: "musubi",
    name: "Musubi",
    description: "Savory Japanese-inspired rice snack with a tasty filling.",
    price: 55,
    category: "Musubi & Churros",
    badge: "Order Now",
    color: "from-amber-200 via-yellow-100 to-orange-200",
    availability: ["DWCL", "Legazpi", "Daraga"],
    inventory: "In Stock",
  },
  {
    id: "churros",
    name: "Churros",
    description: "Golden, crunchy, and dusted with sweet cinnamon sugar.",
    price: 60,
    category: "Musubi & Churros",
    badge: "Pre-Order Now",
    color: "from-orange-200 via-amber-100 to-yellow-200",
    availability: ["DWCL", "Legazpi", "Daraga"],
    inventory: "Pre-Order Only",
  },
  {
    id: "coffee-jelly",
    name: "Coffee Jelly",
    description: "Creamy coffee treat with a smooth, chilled finish.",
    price: 70,
    category: "Coffee Jelly & Cookies",
    badge: "Order Now",
    color: "from-rose-200 via-violet-100 to-fuchsia-200",
    availability: ["DWCL"],
    inventory: "In Stock",
  },
  {
    id: "cookies",
    name: "Cookies",
    description: "Freshly baked cookies for a warm, sweet bite.",
    price: 75,
    category: "Coffee Jelly & Cookies",
    badge: "Order Now",
    color: "from-pink-200 via-red-100 to-yellow-100",
    availability: ["DWCL"],
    inventory: "Out of Stock",
  },
];

export const deliveryZones = [
  {
    code: "DWCL",
    label: "DWCL Campus Area",
    fee: 0,
    note: "All menu items available. Free shipping.",
    eligible: ["musubi", "churros", "coffee-jelly", "cookies"],
  },
  {
    code: "Legazpi",
    label: "Legazpi City / Daraga",
    fee: 30,
    note: "Musubi & Churros only for Saturday delivery or Grab Express.",
    eligible: ["musubi", "churros"],
  },
  {
    code: "Daraga",
    label: "Daraga Area",
    fee: 30,
    note: "Musubi & Churros only for Saturday delivery or Grab Express.",
    eligible: ["musubi", "churros"],
  },
  {
    code: "Outside",
    label: "Outside Legazpi / Daraga",
    fee: 0,
    note: "Contact Muragoods on social media for custom orders.",
    eligible: [],
  },
] as const;

export const mockOrders: Order[] = [
  {
    id: "MUR-101",
    customer: "Andrea R.",
    phone: "0917-234-9904",
    zone: "DWCL",
    address: "DWCL Student Center",
    payment: "GCash",
    status: "Payment Verified",
    total: 210,
    items: ["Musubi x 2", "Churros x 1"],
    deliveryType: "Free Shipping",
  },
  {
    id: "MUR-102",
    customer: "Liam G.",
    phone: "0936-800-1010",
    zone: "Legazpi",
    address: "9th St., Old Albay",
    payment: "Cash on Delivery",
    status: "Preparing",
    total: 190,
    items: ["Musubi x 3"],
    deliveryType: "Saturday Delivery",
  },
  {
    id: "MUR-103",
    customer: "Nina T.",
    phone: "0998-189-7422",
    zone: "Daraga",
    address: "Zone 5, Daraga",
    payment: "GCash",
    status: "Out for Delivery",
    total: 150,
    items: ["Churros x 2"],
    deliveryType: "Grab Express",
  },
];
