/**
 * Admin permission vocabulary.
 *
 * Deliberately its own module with no server imports: the staff editor and the
 * admin nav are client components and need these names, while `lib/auth/session`
 * is `server-only` and cannot be pulled into a browser bundle.
 */

/** Every section a manager can be granted. Mirrors the CHECK on staff_permissions. */
export const ADMIN_PERMISSIONS = [
  "products",
  "categories",
  "stock",
  "orders",
  "payments",
  "customers",
  "coupons",
  "banners",
  "reviews",
  "reports",
] as const;

export type GrantablePermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * `settings` and `staff` are admin-only and never appear in the grant editor —
 * whoever can grant access can grant themselves anything, so delegating it
 * would make the manager/admin distinction meaningless.
 */
export type AdminPermission = GrantablePermission | "settings" | "staff";

export const ALL_PERMISSIONS: AdminPermission[] = [
  ...ADMIN_PERMISSIONS,
  "settings",
  "staff",
];

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  products: "Products",
  categories: "Categories",
  stock: "Stock",
  orders: "Orders",
  payments: "Payments",
  customers: "Customers",
  coupons: "Coupons",
  banners: "Banners",
  reviews: "Reviews",
  reports: "Reports",
  settings: "Settings",
  staff: "Staff",
};

/** One-line description shown under each checkbox in the staff editor. */
export const PERMISSION_HINTS: Record<GrantablePermission, string> = {
  products: "Create, edit and publish products",
  categories: "Manage the category tree",
  stock: "Adjust stock levels",
  orders: "View orders and change their status",
  payments: "Verify bKash and Nagad transfers",
  customers: "View customer accounts and spend",
  coupons: "Create and pause discount codes",
  banners: "Edit homepage banners and tiles",
  reviews: "Approve or reject reviews",
  reports: "See revenue, cost and margin",
};
