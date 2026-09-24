import type { HelpCategory, HelpStep, TourPlacement, ExpectedAction } from "./types";
import type { UserRole } from "@/lib/types/domain";

/**
 * Source of truth for Help Center content. `npm run help:seed` upserts these
 * into help_workflows (computing feature_hash from `sourceFiles`); the same
 * registry is the last-resort fallback when a user is offline with a cold
 * IndexedDB cache. `sourceFiles` never reach the database — they are the UI
 * components each workflow documents, hashed by lib/help/driftDetector.ts.
 */
export interface WorkflowDefinition {
  id: string;
  category_id: string;
  title: string;
  summary: string;
  allowed_roles: UserRole[];
  target_route: string;
  estimated_time_min: number;
  version: string;
  sourceFiles: string[];
  steps: HelpStep[];
}

const ALL_ROLES: UserRole[] = ["cashier", "store_manager", "ui_designer", "super_admin"];
const MANAGERS: UserRole[] = ["store_manager", "super_admin"];

function step(
  n: number,
  title: string,
  description: string,
  anchor: string,
  action: ExpectedAction,
  placement: TourPlacement = "bottom"
): HelpStep {
  return {
    step_number: n,
    title,
    description,
    target_selector: `[data-tour="${anchor}"]`,
    placement,
    desktop_image_url: null,
    mobile_image_url: null,
    expected_action: action,
  };
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { id: "cat_pos", title: "Point of Sale", icon: "ShoppingCart", sort_order: 1, is_active: true },
  { id: "cat_inventory", title: "Inventory & Analytics", icon: "Package", sort_order: 2, is_active: true },
  { id: "cat_orders", title: "Orders & Refunds", icon: "Receipt", sort_order: 3, is_active: true },
  { id: "cat_design", title: "Customization", icon: "Palette", sort_order: 4, is_active: true },
];

const POS = ["components/pos/PosTerminal.tsx", "app/pos/page.tsx"];

export const HELP_WORKFLOWS: WorkflowDefinition[] = [
  {
    id: "wf_open_till",
    category_id: "cat_pos",
    title: "Open your till",
    summary:
      "Count your starting cash and open the register at the start of a shift. You cannot ring up sales until a register session is open.",
    allowed_roles: ALL_ROLES,
    target_route: "/pos",
    estimated_time_min: 1,
    version: "1.0.0",
    sourceFiles: ["components/pos/OpenRegisterDialog.tsx", ...POS],
    steps: [
      step(1, "Count your starting cash", "Count the notes and coins in the drawer and enter the total as your opening float.", "pos-open-float", "input"),
      step(2, "Open the register", "Tap Open register. Sales are now attached to this shift and its Z-Report.", "pos-open-submit", "click", "top"),
      step(3, "You are ready to sell", "The catalog and cart are now active. Online or offline, every sale is recorded against this till.", "pos-cart", "observe", "left"),
    ],
  },
  {
    id: "wf_barcode_checkout",
    category_id: "cat_pos",
    title: "Scan and check out a sale",
    summary:
      "Scan a barcode (or tap a product), review the cart, choose a payment method and complete the sale. A scanner acts like a keyboard, so it works anywhere on the screen.",
    allowed_roles: ALL_ROLES,
    target_route: "/pos",
    estimated_time_min: 2,
    version: "1.0.0",
    sourceFiles: ["components/pos/CatalogGrid.tsx", "components/pos/CartPanel.tsx", "components/pos/CheckoutModal.tsx", ...POS],
    steps: [
      step(1, "Scan or search", "Scan a barcode, or type a name / SKU here. Invalid scans are rejected with a check-digit warning.", "pos-search", "scan"),
      step(2, "Or tap a product", "Tap any product tile to add it to the cart.", "pos-product-card", "click"),
      step(3, "Review the cart", "Adjust quantities or remove lines. Totals include tax and any discount.", "pos-cart", "observe", "left"),
      step(4, "Charge", "Tap Charge to open the payment window.", "pos-charge-btn", "click", "top"),
      step(5, "Choose payment", "Pick cash, card or another method. Cash shows quick-tender buttons and change due.", "checkout-payment", "click"),
      step(6, "Complete the sale", "Confirm to finish. The receipt can be printed straight away.", "checkout-submit", "click", "top"),
    ],
  },
  {
    id: "wf_offline_sales",
    category_id: "cat_pos",
    title: "Keep selling when the internet drops",
    summary:
      "The terminal keeps working offline: sales are queued on this device and sent automatically once the connection returns. Never clear browser data while sales are pending.",
    allowed_roles: ALL_ROLES,
    target_route: "/pos",
    estimated_time_min: 2,
    version: "1.0.0",
    sourceFiles: ["components/layout/ConnectionBadge.tsx", "lib/pos/checkout.ts", ...POS],
    steps: [
      step(1, "Watch the connection badge", "It turns to Offline (with a pending count) when the network is lost.", "pos-connection", "observe", "bottom"),
      step(2, "Keep ringing up sales", "Scan and charge exactly as usual. Sales are stored on this device with an OFFLINE invoice number.", "pos-charge-btn", "click", "top"),
      step(3, "Let it sync", "When you are back online the queue replays automatically and the badge clears.", "pos-connection", "observe"),
    ],
  },
  {
    id: "wf_customer_refund",
    category_id: "cat_orders",
    title: "Refund or return an order",
    summary:
      "Managers can return items from a completed order. Stock is restored and the refund is written to the ledger — original records are never edited.",
    allowed_roles: MANAGERS,
    target_route: "/dashboard/orders",
    estimated_time_min: 3,
    version: "1.0.0",
    sourceFiles: ["components/dashboard/orders/OrdersManager.tsx", "components/dashboard/orders/OrderDetailSheet.tsx"],
    steps: [
      step(1, "Find the order", "Search by invoice number, then open the order from the list.", "orders-table", "click", "top"),
      step(2, "Start the return", "Choose Return / Refund in the order details.", "orders-return-btn", "click", "left"),
    ],
  },
  {
    id: "wf_sister_store_lookup",
    category_id: "cat_pos",
    title: "Find stock at a sister store",
    summary: "When an item is out of stock, check which other stores in the mall have it so you can send the customer there.",
    allowed_roles: ALL_ROLES,
    target_route: "/pos",
    estimated_time_min: 1,
    version: "1.0.0",
    sourceFiles: ["components/pos/ProductCard.tsx", "components/pos/SisterStoreModal.tsx", ...POS],
    steps: [
      step(1, "Search for the item", "Find the product the customer wants.", "pos-search", "input"),
      step(2, "Spot the out-of-stock tile", "Out-of-stock tiles show an Inspect Sister Stores button.", "pos-product-card", "observe"),
      step(3, "Inspect sister stores", "Tap it to see which stores nearby hold stock, with unit and floor numbers.", "pos-sister-store-btn", "click", "top"),
    ],
  },
  {
    id: "wf_z_report",
    category_id: "cat_pos",
    title: "Close your shift (Z-Report)",
    summary:
      "At the end of a shift, count the cash in the drawer, close the register and print the Z-Report showing expected cash, counted cash and any discrepancy.",
    allowed_roles: ALL_ROLES,
    target_route: "/pos",
    estimated_time_min: 3,
    version: "1.0.0",
    sourceFiles: ["components/pos/CloseShiftModal.tsx", ...POS],
    steps: [
      step(1, "Start closing", "Tap Close Shift / Z-Report.", "pos-close-shift", "click", "bottom"),
      step(2, "Count the drawer", "Enter the physical cash you counted, without looking at the expected amount.", "close-counted-cash", "input"),
      step(3, "Close the shift", "Confirm to lock the session and produce the Z-Report.", "close-submit", "click", "top"),
    ],
  },
  {
    id: "wf_dead_stock_markdown",
    category_id: "cat_inventory",
    title: "Mark down dead stock",
    summary:
      "Use the dead stock monitor to see products that have not sold in 45+ days, ranked by cost tied up, then lower their price from Inventory.",
    allowed_roles: MANAGERS,
    target_route: "/dashboard",
    estimated_time_min: 3,
    version: "1.0.0",
    sourceFiles: ["components/dashboard/home/DeadStockCard.tsx"],
    steps: [
      step(1, "Open the dead stock monitor", "Each row shows days since last sale and the cash tied up in it.", "dash-dead-stock", "observe", "top"),
      step(2, "Plan the markdown", "Start with the highest cost-tied-up items; edit the price in Inventory and re-check next week.", "dash-dead-stock", "observe", "bottom"),
    ],
  },
  {
    id: "wf_layout_builder",
    category_id: "cat_design",
    title: "Customize the dashboard layout",
    summary:
      "Reorder, resize and hide dashboard widgets, adjust the theme, then publish. UI Designers can change layout only — never business data.",
    allowed_roles: ["ui_designer", "super_admin"],
    target_route: "/dashboard/settings/layout-builder",
    estimated_time_min: 3,
    version: "1.0.0",
    sourceFiles: ["components/dashboard/settings/LayoutBuilder.tsx", "components/layout/Header.tsx"],
    steps: [
      step(1, "Arrange widgets", "Drag the handle to reorder; toggle visibility and size per widget.", "layout-widget-list", "click", "right"),
      step(2, "Pick a theme", "Choose density and accent settings.", "layout-theme", "click", "left"),
      step(3, "Publish", "Publish to make the layout live for the store (or mall-wide for super admins).", "layout-publish", "click", "top"),
    ],
  },
];
