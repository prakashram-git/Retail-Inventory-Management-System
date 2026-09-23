import {
  Package,
  Shirt,
  Footprints,
  Watch,
  Gem,
  Baby,
  Sparkles,
  Utensils,
  Home,
  Smartphone,
  BookOpen,
  Dumbbell,
  Palette,
  Gift,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICON_OPTIONS = [
  "Package",
  "Shirt",
  "Footprints",
  "Watch",
  "Gem",
  "Baby",
  "Sparkles",
  "Utensils",
  "Home",
  "Smartphone",
  "BookOpen",
  "Dumbbell",
  "Palette",
  "Gift",
  "ShoppingBag",
] as const;

const ICON_MAP: Record<string, LucideIcon> = {
  Package,
  Shirt,
  Footprints,
  Watch,
  Gem,
  Baby,
  Sparkles,
  Utensils,
  Home,
  Smartphone,
  BookOpen,
  Dumbbell,
  Palette,
  Gift,
  ShoppingBag,
};

export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Package;
  return ICON_MAP[name] ?? Package;
}
