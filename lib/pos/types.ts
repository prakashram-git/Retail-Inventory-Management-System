export interface PosCategory {
  id: string;
  name: string;
  parent_id: string | null;
  is_tax_exempt: boolean;
  icon: string;
}

export interface PosProduct {
  id: string;
  store_id: string;
  category_id: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  retail_price: number;
  current_stock: number;
  image_url: string | null;
  is_active: boolean;
  category: PosCategory | null;
}

export interface CartLine {
  product: PosProduct;
  quantity: number;
}

export type PaymentMethod = "cash" | "card" | "qr_transfer";
