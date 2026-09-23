export type UserRole = "super_admin" | "store_manager" | "cashier";

export interface Profile {
  id: string;
  role: UserRole;
  store_id: string | null;
  full_name: string | null;
}

export interface Store {
  id: string;
  name: string;
  currency: string;
  tax_model: string;
  locale: string | null;
}

/** Full store record, including the admin-only directory fields. */
export interface StoreDirectoryEntry {
  id: string;
  name: string;
  code: string;
  unit_number: string;
  floor_number: string | null;
  currency: string;
  locale: string;
  timezone: string;
  tax_model: "inclusive" | "exclusive";
  is_active: boolean;
  created_at: string;
}

export interface AppearanceSettings {
  home_background_url: string;
  blur_strength: number;
  overlay_opacity: number;
}

export interface StaffMember {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  store_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string;
  sort_order: number;
  default_min_threshold: number;
  is_tax_exempt: boolean;
  created_at: string;
}

/** Category joined with the count of products directly assigned to it. */
export interface CategoryWithCount extends Category {
  product_count: number;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  tags: string[] | null;
  cost_price: number;
  retail_price: number;
  current_stock: number;
  min_threshold: number | null;
  image_url: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface ProductWithCategory extends Product {
  category: Pick<Category, "id" | "name" | "slug" | "parent_id"> | null;
}
