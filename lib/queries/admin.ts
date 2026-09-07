import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth/session";
import type { Order, OrderStatus } from "@/types/database";

/**
 * Admin reads.
 *
 * These use the SERVICE-ROLE client, which bypasses RLS — that is the only way
 * to read `products.cost_paisa` (revoked at the column level in migration 0011)
 * and therefore the only way to compute margin.
 *
 * Every exported function calls `requireStaff()` FIRST. An unguarded
 * service-role query is a data breach, not a bug.
 */

export interface DashboardStats {
  todayRevenuePaisa: number;
  todayOrders: number;
  monthRevenuePaisa: number;
  monthOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  totalCustomers: number;
  lowStockCount: number;
  pendingReviews: number;
  grossMarginPaisa: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireStaff();
  const db = createAdminClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, month, pending, delivered, customers, lowStock, reviews] =
    await Promise.all([
      db
        .from("orders")
        .select("total_paisa")
        .gte("placed_at", todayStart.toISOString())
        .not("status", "in", "(cancelled,returned)"),
      db
        .from("orders")
        .select("total_paisa, subtotal_paisa, discount_paisa")
        .gte("placed_at", monthStart.toISOString())
        .not("status", "in", "(cancelled,returned)"),
      db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["placed", "confirmed", "processing"]),
      db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "delivered"),
      db.from("profiles").select("id", { count: "exact", head: true }),
      db
        .from("products")
        .select("id", { count: "exact", head: true })
        .neq("status", "archived")
        .lte("stock", 5),
      db
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  const todayRows = today.data ?? [];
  const monthRows = month.data ?? [];

  // Margin needs cost, which only the service role can read. Computed from the
  // month's delivered lines rather than every order ever placed.
  const { data: soldLines } = await db
    .from("order_items")
    .select("product_id, quantity, line_total_paisa, orders!inner(placed_at, status)")
    .gte("orders.placed_at", monthStart.toISOString())
    .not("orders.status", "in", "(cancelled,returned)");

  const lines = (soldLines ?? []) as unknown as {
    product_id: string | null;
    quantity: number;
    line_total_paisa: number;
  }[];

  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))];
  const { data: costs } = productIds.length
    ? await db.from("products").select("id, cost_paisa").in("id", productIds)
    : { data: [] };

  const costById = new Map(
    ((costs ?? []) as { id: string; cost_paisa: number | null }[]).map((c) => [
      c.id,
      c.cost_paisa ?? 0,
    ]),
  );

  const grossMarginPaisa = lines.reduce((sum, l) => {
    const cost = (costById.get(l.product_id ?? "") ?? 0) * l.quantity;
    return sum + (l.line_total_paisa - cost);
  }, 0);

  return {
    todayRevenuePaisa: todayRows.reduce((s, o) => s + (o.total_paisa ?? 0), 0),
    todayOrders: todayRows.length,
    monthRevenuePaisa: monthRows.reduce((s, o) => s + (o.total_paisa ?? 0), 0),
    monthOrders: monthRows.length,
    pendingOrders: pending.count ?? 0,
    deliveredOrders: delivered.count ?? 0,
    totalCustomers: customers.count ?? 0,
    lowStockCount: lowStock.count ?? 0,
    pendingReviews: reviews.count ?? 0,
    grossMarginPaisa,
  };
}

/** Daily revenue for the dashboard chart. Bounded by design — 30 points max. */
export async function getRevenueSeries(days = 30) {
  await requireStaff();
  const db = createAdminClient();

  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const { data } = await db
    .from("orders")
    .select("placed_at, total_paisa")
    .gte("placed_at", from.toISOString())
    .not("status", "in", "(cancelled,returned)")
    .order("placed_at");

  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    byDay.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
  }

  for (const row of data ?? []) {
    const key = String(row.placed_at).slice(0, 10);
    const entry = byDay.get(key);
    if (entry) {
      entry.revenue += row.total_paisa ?? 0;
      entry.orders += 1;
    }
  }

  return [...byDay.entries()].map(([date, v]) => ({
    date,
    label: new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    revenue: v.revenue / 100,
    orders: v.orders,
  }));
}

export async function getBestSellers(limit = 8) {
  await requireStaff();
  const db = createAdminClient();

  const { data } = await db
    .from("products")
    .select("id, name, slug, units_sold, price_paisa, cost_paisa, stock, thumbnail_url")
    .gt("units_sold", 0)
    .order("units_sold", { ascending: false })
    .limit(limit);

  return (data ?? []) as {
    id: string;
    name: string;
    slug: string;
    units_sold: number;
    price_paisa: number;
    cost_paisa: number | null;
    stock: number;
    thumbnail_url: string | null;
  }[];
}

export async function getLowStock(limit = 20) {
  await requireStaff();
  const db = createAdminClient();

  const { data } = await db
    .from("products")
    .select("id, name, slug, stock, low_stock_threshold, status, sku, thumbnail_url")
    .neq("status", "archived")
    .order("stock", { ascending: true })
    .limit(limit);

  return (data ?? []) as {
    id: string;
    name: string;
    slug: string;
    stock: number;
    low_stock_threshold: number;
    status: string;
    sku: string;
    thumbnail_url: string | null;
  }[];
}

export interface AdminOrderRow extends Order {
  item_count: number;
}

export async function listAdminOrders(filter: {
  status?: OrderStatus | "all";
  q?: string;
  limit?: number;
}) {
  await requireStaff();
  const db = createAdminClient();

  let query = db
    .from("orders")
    .select("*")
    .order("placed_at", { ascending: false })
    .limit(filter.limit ?? 100);

  if (filter.status && filter.status !== "all") {
    query = query.eq("status", filter.status);
  }
  if (filter.q) {
    // Support looks orders up by number or phone, and both are indexed.
    query = query.or(
      `order_number.ilike.%${filter.q}%,customer_phone.ilike.%${filter.q}%,customer_name.ilike.%${filter.q}%`,
    );
  }

  const { data } = await query;
  const orders = (data ?? []) as Order[];

  const { data: counts } = orders.length
    ? await db
        .from("order_items")
        .select("order_id, quantity")
        .in("order_id", orders.map((o) => o.id))
    : { data: [] };

  const byOrder = new Map<string, number>();
  for (const c of (counts ?? []) as { order_id: string; quantity: number }[]) {
    byOrder.set(c.order_id, (byOrder.get(c.order_id) ?? 0) + c.quantity);
  }

  return orders.map((o) => ({ ...o, item_count: byOrder.get(o.id) ?? 0 }));
}
