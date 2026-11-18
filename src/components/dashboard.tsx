"use client";

import { useEffect, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SectionId = "overview" | "sales" | "products" | "ads" | "stocks" | "finance" | "alerts" | "settings";
type MarketplaceId = "ozon" | "wb";
type ReportStatus = "ready" | "error";
type UploadedReport = {
  id: string;
  marketplace: MarketplaceId;
  name: string;
  kind: string;
  rows: number;
  revenue: number;
  orders: number;
  periodKey: string;
  analytics?: ReportAnalytics;
  uploadedAt: string;
  status: ReportStatus;
  message?: string;
};
type ImportSummary = { files: number; rows: number; revenue: number; orders: number };

const periodOptions = [
  { value: "all", label: "Все данные" },
  { value: "2026-11", label: "Ноябрь 2026" },
  { value: "2026-10", label: "Октябрь 2026" },
  { value: "2026-09", label: "Сентябрь 2026" },
  { value: "2026-08", label: "Август 2026" },
  { value: "2026-07", label: "Июль 2026" },
  { value: "2026-06", label: "Июнь 2026" },
  { value: "2026-05", label: "Май 2026" },
  { value: "2026-04", label: "Апрель 2026" },
  { value: "2026-03", label: "Март 2026" },
  { value: "2026-02", label: "Февраль 2026" },
  { value: "2026-01", label: "Январь 2026" },
];

function periodFromFileName(fileName: string) {
  const source = fileName.toLowerCase().replace(/ё/g, "е");
  const numeric = source.match(/(20\d{2})[-_. ](0?[1-9]|1[0-2])/);
  if (numeric) return `${numeric[1]}-${numeric[2].padStart(2, "0")}`;
  const months = [
    ["01", ["январ", "january", "jan"]], ["02", ["феврал", "february", "feb"]],
    ["03", ["март", "march", "mar"]], ["04", ["апрел", "april", "apr"]],
    ["05", ["май", "мая", "may"]], ["06", ["июн", "june", "jun"]],
    ["07", ["июл", "july", "jul"]], ["08", ["август", "august", "aug"]],
    ["09", ["сентябр", "september", "sep"]], ["10", ["октябр", "october", "oct"]],
    ["11", ["ноябр", "november", "nov"]], ["12", ["декабр", "december", "dec"]],
  ] as const;
  const month = months.find(([, aliases]) => aliases.some((alias) => source.includes(alias)))?.[0];
  if (!month) return null;
  const year = source.match(/20\d{2}/)?.[0] ?? "2026";
  return `${year}-${month}`;
}

function periodFromValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  if (typeof value === "number" && value > 30000 && value < 70000) {
    const date = new Date(Date.UTC(1899, 11, 30 + value));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  let match = text.match(/(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}`;
  match = text.match(/(?:0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})/);
  if (match) return `${match[2]}-${match[1].padStart(2, "0")}`;
  return null;
}

function inferReportPeriod(rows: unknown[][], fileName: string, fallback: string, kind: ReportAnalytics["kind"] = "generic") {
  const declaredPeriod = rows.slice(0, 12).flat().map((cell) => String(cell ?? "")).find((cell) => normalizeHeader(cell).startsWith("период"));
  const declaredKey = declaredPeriod ? periodFromValue(declaredPeriod) : null;
  if (declaredKey) return declaredKey;
  if (kind === "catalog") return fallback;
  const headerRow = rows.find((row) => row.some((cell) => normalizeHeader(cell).includes("дата"))) ?? rows[0] ?? [];
  const headers = headerRow.map(normalizeHeader);
  const dateColumns = headers.map((header, index) => ({ header, index })).filter(({ header }) => header.includes("дата") || header.includes("date")).map(({ index }) => index);
  const counts = new Map<string, number>();
  rows.slice(1, 5001).forEach((row) => dateColumns.forEach((column) => {
    const key = periodFromValue(row[column]);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }));
  const detected = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return detected ?? periodFromFileName(fileName) ?? fallback;
}

const sections: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: "overview", label: "Обзор", icon: "⌁" },
  { id: "sales", label: "Продажи", icon: "↗" },
  { id: "products", label: "Товары", icon: "◇" },
  { id: "ads", label: "Реклама", icon: "◎" },
  { id: "stocks", label: "Остатки", icon: "▦" },
  { id: "finance", label: "Финансы", icon: "₽" },
  { id: "alerts", label: "Уведомления", icon: "!" },
  { id: "settings", label: "Источники данных", icon: "⇄" },
];

const titles: Record<SectionId, { title: string; subtitle: string }> = {
  overview: { title: "Пульс бизнеса", subtitle: "Главные изменения, которые требуют решения сегодня" },
  sales: { title: "Продажи", subtitle: "Заказы, реализации и возвраты считаются раздельно" },
  products: { title: "Товары", subtitle: "Эффективность SKU без склейки похожих названий" },
  ads: { title: "Реклама", subtitle: "Атрибуция площадок показана отдельно" },
  stocks: { title: "Остатки", subtitle: "Доступно, зарезервировано и в пути — разные состояния" },
  finance: { title: "Финансы", subtitle: "Управленческая прибыль только при полных данных" },
  alerts: { title: "Уведомления", subtitle: "Только значимые сигналы, без повторов и ложных тревог" },
  settings: { title: "Источники данных", subtitle: "Загрузите отчёты вручную или подключите API выбранного магазина" },
};

const marketplaceMeta: Record<MarketplaceId, { name: string; short: string; color: string }> = {
  ozon: { name: "Ozon", short: "OZ", color: "#1769ff" },
  wb: { name: "Wildberries", short: "WB", color: "#b13bc2" },
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(text: string) {
  const delimiter = (text.split("\n")[0]?.match(/;/g)?.length ?? 0) > (text.split("\n")[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = ""; continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function dateIso(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const text = String(value ?? "").trim();
  let match = text.match(/(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = text.match(/(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return null;
}

function dayLabel(iso: string) {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][month - 1]}`;
}

function analyticsFromRows(rows: unknown[][], marketplace: MarketplaceId): ReportAnalytics {
  const market = marketplace === "ozon" ? "Ozon" as const : "WB" as const;
  const empty = (kind: ReportAnalytics["kind"] = "generic"): ReportAnalytics => ({ kind, sourceRows: 0, daily: [], products: [], campaigns: [], metrics: { ...emptyMetrics } });
  const normalizedRows = rows.map((row) => row.map(normalizeHeader));
  const richHeader = normalizedRows.findIndex((row) => row.some((cell) => cell.includes("заказанонасуммупоценереализации")));

  if (richHeader >= 0) {
    const dataRows = rows.slice(richHeader + 3).filter((row) => dateIso(row[9]));
    const daily = new Map<string, DailyPoint>();
    const products = new Map<string, ProductRow & { lastDate: string }>();
    dataRows.forEach((row) => {
      const iso = dateIso(row[9])!;
      const revenue = numericValue(row[12]);
      const orders = numericValue(row[28]);
      const point = daily.get(iso) ?? { iso, day: dayLabel(iso), sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 };
      point.sales += revenue;
      point.orders += orders;
      point.delivered += numericValue(row[31]);
      point.canceled += numericValue(row[32]);
      point.returned += numericValue(row[33]);
      daily.set(iso, point);
      const sku = String(row[7] ?? row[8] ?? "").trim();
      if (!sku) return;
      const current = products.get(sku) ?? { sku, name: String(row[0] ?? sku), market, orders: 0, revenue: 0, margin: null, stock: 0, reserved: 0, inTransit: 0, days: 0, score: 0, lastDate: "" };
      current.orders += orders; current.revenue += revenue;
      if (iso >= current.lastDate) { current.stock = numericValue(row[40]); current.lastDate = iso; }
      products.set(sku, current);
    });
    const total = rows[richHeader + 2] ?? [];
    const metrics: ReportMetrics = { ...emptyMetrics, revenue: numericValue(total[12]), orders: numericValue(total[28]), delivered: numericValue(total[31]), canceled: numericValue(total[32]), returned: numericValue(total[33]), impressions: numericValue(total[16]) };
    const productRows = [...products.values()].map((source): ProductRow => {
      const product = { sku: source.sku, name: source.name, market: source.market, orders: source.orders, revenue: source.revenue, margin: source.margin, stock: source.stock, reserved: source.reserved, inTransit: source.inTransit, days: source.days, score: source.score };
      const days = product.orders ? Math.round(product.stock / (product.orders / 31)) : 0;
      return { ...product, days, score: Math.min(100, Math.round((product.orders ? 55 : 25) + Math.min(35, days))) };
    }).sort((a, b) => b.revenue - a.revenue);
    return { kind: "sales", sourceRows: dataRows.length, daily: [...daily.values()].sort((a, b) => a.iso.localeCompare(b.iso)), products: productRows, campaigns: [], metrics };
  }

  const headerIndex = normalizedRows.findIndex((row) => row.some((cell) => cell === "номерзаказа") && row.some((cell) => cell.includes("суммаотправления")));
  if (headerIndex >= 0) {
    const headers = normalizedRows[headerIndex];
    const col = (...names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));
    const iDate = col("принятвобработку", "датаотгрузки"), iRevenue = col("суммаотправления", "оплаченопокупателем"), iQty = col("количество"), iStatus = col("статус"), iSku = col("sku"), iName = col("названиетовара");
    const body = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell ?? "").trim()));
    const daily = new Map<string, DailyPoint>(), products = new Map<string, ProductRow>();
    let revenue = 0, orders = 0, delivered = 0, canceled = 0, returned = 0;
    body.forEach((row) => {
      const qty = Math.max(1, numericValue(row[iQty]));
      const amount = numericValue(row[iRevenue]);
      const status = String(row[iStatus] ?? "").toLowerCase();
      orders += qty; revenue += amount;
      if (status.includes("достав")) delivered += qty;
      if (status.includes("отмен")) canceled += qty;
      if (status.includes("возврат")) returned += qty;
      const iso = dateIso(row[iDate]);
      if (iso) {
        const point = daily.get(iso) ?? { iso, day: dayLabel(iso), sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 };
        point.sales += amount;
        point.orders += qty;
        if (status.includes("достав")) point.delivered += qty;
        if (status.includes("отмен")) point.canceled += qty;
        if (status.includes("возврат")) point.returned += qty;
        daily.set(iso, point);
      }
      const sku = String(row[iSku] ?? "").trim();
      if (sku) { const product = products.get(sku) ?? { sku, name: String(row[iName] ?? sku), market, orders: 0, revenue: 0, margin: null, stock: 0, reserved: 0, inTransit: 0, days: 0, score: 55 }; product.orders += qty; product.revenue += amount; products.set(sku, product); }
    });
    return { kind: "orders", sourceRows: body.length, daily: [...daily.values()].sort((a, b) => a.iso.localeCompare(b.iso)), products: [...products.values()].sort((a, b) => b.revenue - a.revenue), campaigns: [], metrics: { ...emptyMetrics, revenue, orders, delivered, canceled, returned } };
  }

  const catalogHeader = normalizedRows.findIndex((row) => row.some((cell) => cell.includes("ozonproductid")) && row.some((cell) => cell.includes("доступнокпродаже")));
  if (catalogHeader >= 0) {
    const headers = normalizedRows[catalogHeader];
    const col = (...names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));
    const iSku = col("sku"), iName = col("названиетовара"), iFbo = col("доступнокпродажепосхемеfbo"), iFbs = col("доступнокпродажепосхемеfbs"), iReal = col("доступнокпродажепосхемеrealfbs"), iReserved = col("зарезервировано"), iPrice = col("ценанасайте");
    const body = rows.slice(catalogHeader + 1).filter((row) => String(row[iSku] ?? "").trim());
    const products = body.map((row): ProductRow => ({ sku: String(row[iSku]), name: String(row[iName] ?? row[iSku]), market, orders: 0, revenue: 0, margin: null, stock: numericValue(row[iFbo]) + numericValue(row[iFbs]) + numericValue(row[iReal]), reserved: numericValue(row[iReserved]), inTransit: 0, days: 0, score: numericValue(row[iPrice]) > 0 ? 50 : 25 }));
    return { ...empty("catalog"), sourceRows: body.length, products };
  }

  const adsHeader = normalizedRows.findIndex((row) => row.some((cell) => cell.includes("idкампании")) && row.some((cell) => cell.includes("расход")));
  if (adsHeader >= 0) {
    const headers = normalizedRows[adsHeader];
    const col = (...names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));
    const iId = col("idкампании"), iPlacement = col("месторазмещения"), iSpend = col("расход"), iRevenue = col("продаживпродвижении"), iOrders = col("проданотоваровшт"), iImpressions = col("показы"), iClicks = col("клики");
    const body = rows.slice(adsHeader + 1).filter((row) => String(row[iId] ?? "").trim());
    const grouped = new Map<string, { name: string; spend: number; revenue: number; orders: number; impressions: number; clicks: number }>();
    body.forEach((row) => { const id = String(row[iId]); const item = grouped.get(id) ?? { name: `Кампания ${id}${row[iPlacement] ? ` · ${row[iPlacement]}` : ""}`, spend: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0 }; item.spend += numericValue(row[iSpend]); item.revenue += numericValue(row[iRevenue]); item.orders += numericValue(row[iOrders]); item.impressions += numericValue(row[iImpressions]); item.clicks += numericValue(row[iClicks]); grouped.set(id, item); });
    const campaigns = [...grouped.values()].map((item): CampaignRow => ({ ...item, revenue: item.revenue, drr: item.revenue ? item.spend / item.revenue * 100 : null, roas: item.spend ? item.revenue / item.spend : null, status: item.revenue && item.spend / item.revenue <= .18 ? "В пределах цели" : "Выше цели" })).sort((a, b) => b.spend - a.spend);
    const metrics = campaigns.reduce<ReportMetrics>((sum, item) => ({ ...sum, adSpend: sum.adSpend + item.spend, adRevenue: sum.adRevenue + (item.revenue ?? 0), impressions: sum.impressions + item.impressions, clicks: sum.clicks + item.clicks }), { ...emptyMetrics });
    return { kind: "ads", sourceRows: body.length, daily: [], products: [], campaigns, metrics };
  }
  return empty();
}

function combineAnalytics(reports: UploadedReport[]): DashboardAnalytics {
  const sources = reports.flatMap((report) => report.analytics ? [report.analytics] : []);
  const salesSources = sources.filter((source) => source.kind === "sales").sort((a, b) => b.metrics.revenue - a.metrics.revenue);
  const orderSources = sources.filter((source) => source.kind === "orders").sort((a, b) => b.metrics.revenue - a.metrics.revenue);
  const primary = salesSources[0] ?? orderSources[0];
  const productMap = new Map((primary?.products ?? []).map((product) => [product.sku, { ...product }]));
  sources.filter((source) => source.kind === "catalog").flatMap((source) => source.products).forEach((catalog) => {
    const current = productMap.get(catalog.sku);
    productMap.set(catalog.sku, current ? { ...current, name: catalog.name || current.name, stock: catalog.stock, reserved: catalog.reserved, inTransit: catalog.inTransit, days: current.orders ? Math.round(catalog.stock / (current.orders / 31)) : 0 } : catalog);
  });
  const campaigns = sources.filter((source) => source.kind === "ads").flatMap((source) => source.campaigns);
  const adMetrics = sources.filter((source) => source.kind === "ads").reduce<ReportMetrics>((sum, source) => ({ ...sum, adSpend: sum.adSpend + source.metrics.adSpend, adRevenue: sum.adRevenue + source.metrics.adRevenue, impressions: sum.impressions + source.metrics.impressions, clicks: sum.clicks + source.metrics.clicks }), { ...emptyMetrics });
  return { daily: primary?.daily ?? [], products: [...productMap.values()].sort((a, b) => b.revenue - a.revenue), campaigns, metrics: { ...(primary?.metrics ?? emptyMetrics), adSpend: adMetrics.adSpend, adRevenue: adMetrics.adRevenue, impressions: adMetrics.impressions, clicks: adMetrics.clicks } };
}

function reportKind(fileName: string, headers: string[]) {
  const source = normalizeHeader(`${fileName} ${headers.join(" ")}`);
  if (source.includes("остат") || source.includes("stock") || source.includes("ozonproductid")) return "Остатки";
  if (source.includes("реклам") || source.includes("продвиж") || source.includes("advert") || source.includes("campaign")) return "Реклама";
  if (source.includes("финанс") || source.includes("commission") || source.includes("удержан")) return "Финансы";
  return "Продажи";
}

function summarizeRows(rows: unknown[][]) {
  if (rows.length < 2) return { rows: 0, revenue: 0, orders: 0, headers: [] as string[] };
  const headers = rows[0].map(normalizeHeader);
  const find = (variants: string[]) => headers.findIndex((header) => variants.some((variant) => header.includes(variant)));
  const revenueColumn = find(["выруч", "суммапрод", "кперечислению", "revenue", "total", "итого"]);
  const orderColumn = headers.findIndex((header) => !header.includes("номер") && !header.includes("id") && ["количествозаказ", "orders", "заказы"].some((variant) => header.includes(variant)));
  const body = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  return {
    rows: body.length,
    revenue: revenueColumn >= 0 ? body.reduce((sum, row) => sum + numericValue(row[revenueColumn]), 0) : 0,
    orders: orderColumn >= 0 ? body.reduce((sum, row) => sum + numericValue(row[orderColumn]), 0) : body.length,
    headers,
  };
}

async function rowsFromFile(file: File): Promise<unknown[][]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") return readSheet(file);
  if (extension === "json") {
    const parsed = JSON.parse(await file.text()) as unknown;
    const items = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed ? Object.values(parsed).find(Array.isArray) : null;
    if (!Array.isArray(items) || !items.length || typeof items[0] !== "object" || !items[0]) throw new Error("В JSON не найден массив строк");
    const headers = Object.keys(items[0] as Record<string, unknown>);
    return [headers, ...items.map((item) => headers.map((header) => (item as Record<string, unknown>)[header]))];
  }
  if (extension === "csv" || extension === "txt") return parseCsv(await file.text());
  throw new Error("Поддерживаются CSV, JSON и XLSX");
}

const trend = [
  { day: "11 ноя", sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 },
  { day: "12 ноя", sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 },
  { day: "13 ноя", sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 },
  { day: "14 ноя", sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 },
  { day: "15 ноя", sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 },
  { day: "16 ноя", sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 },
  { day: "17 ноя", sales: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, previous: 0 },
];

type ProductRow = { sku: string; name: string; market: "WB" | "Ozon"; orders: number; revenue: number; margin: number | null; stock: number; reserved: number; inTransit: number; days: number; score: number };
type CampaignRow = { name: string; spend: number; revenue: number | null; drr: number | null; roas: number | null; status: string; impressions: number; clicks: number; orders: number };
type DailyPoint = { day: string; iso: string; sales: number; orders: number; delivered: number; canceled: number; returned: number; previous: number };
type ReportMetrics = { revenue: number; orders: number; delivered: number; canceled: number; returned: number; adSpend: number; adRevenue: number; impressions: number; clicks: number };
type ReportAnalytics = { kind: "sales" | "orders" | "catalog" | "ads" | "generic"; sourceRows: number; daily: DailyPoint[]; products: ProductRow[]; campaigns: CampaignRow[]; metrics: ReportMetrics };
type DashboardAnalytics = { daily: DailyPoint[]; products: ProductRow[]; campaigns: CampaignRow[]; metrics: ReportMetrics };

const emptyMetrics: ReportMetrics = { revenue: 0, orders: 0, delivered: 0, canceled: 0, returned: 0, adSpend: 0, adRevenue: 0, impressions: 0, clicks: 0 };

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("ru-RU");

function fileCount(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "файлов" : mod10 === 1 ? "файл" : mod10 >= 2 && mod10 <= 4 ? "файла" : "файлов";
  return `${value} ${word}`;
}

function Change({ children, negative = false }: { children: React.ReactNode; negative?: boolean }) {
  return <span className={negative ? "change negative" : "change"}>{children}</span>;
}

function Kpi({ label, value, change, tone = "default", note }: { label: string; value: string; change?: string; tone?: string; note?: string }) {
  return (
    <article className={`kpi kpi-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <div>{change ? <Change negative={change.startsWith("−")}>{change}</Change> : null}<span>{note}</span></div>
    </article>
  );
}

function Status({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "muted" }) {
  return <span className={`status status-${tone}`}><i />{children}</span>;
}

function periodBounds(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  const end = new Date(year, month, 0).getDate();
  return { start: `${period}-01`, end: `${period}-${String(end).padStart(2, "0")}` };
}

function previousPeriodKey(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous * 100;
}

type SummaryIconId = "revenue" | "orders" | "buyouts" | "profit" | "margin" | "ads" | "delivery" | "catalog" | "attention";

function SummaryIcon({ name }: { name: SummaryIconId }) {
  const paths: Record<SummaryIconId, React.ReactNode> = {
    revenue: <><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></>,
    orders: <><path d="M4 5h16v15H4z"/><path d="M8 3v4m8-4v4M4 10h16M8 14h3m2 0h3M8 17h3"/></>,
    buyouts: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></>,
    profit: <><path d="M4 19V9m6 10V5m6 14v-7m4 7V3"/><path d="m3 8 6-4 6 5 6-7"/></>,
    margin: <><path d="M7 17 17 7"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></>,
    ads: <><path d="m4 13 12-5v10L4 13Z"/><path d="M16 10c2 0 4 1.5 4 3s-2 3-4 3M6 14l1 6h4l-1-5"/></>,
    delivery: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    catalog: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/><path d="M12 13v9"/></>,
    attention: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3v.1"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function SummaryCard({ tone, label, value, note, icon, comparison, comparisonLabel = "к прошлому месяцу", inverse = false }: { tone: string; label: string; value: string; note: string; icon: SummaryIconId; comparison: number | null; comparisonLabel?: string; inverse?: boolean }) {
  const comparisonText = comparison === null ? "Нет сравнения" : `${comparison >= 0 ? "↗" : "↘"} ${comparison >= 0 ? "+" : ""}${comparison.toFixed(1).replace(".", ",")}%`;
  const positive = comparison !== null && (inverse ? comparison <= 0 : comparison >= 0);
  return (
    <article className={`summary-card summary-card-${tone}`}>
      <div className="summary-card-top"><span className="summary-card-icon"><SummaryIcon name={icon}/></span></div>
      <span className="summary-card-label">{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
      <div className="summary-card-comparison"><span className={comparison === null ? "neutral" : positive ? "positive" : "negative"}>{comparisonText}</span><small>{comparisonLabel}</small></div>
    </article>
  );
}

function OverviewDashboard({ marketplace, summary, previousSummary, analytics, previousAnalytics, reports, pendingAnalysis, period, onPeriodChange, onOpenSettings, onNavigate }: {
  marketplace: MarketplaceId;
  summary: ImportSummary;
  previousSummary: ImportSummary;
  analytics: DashboardAnalytics;
  previousAnalytics: DashboardAnalytics;
  reports: UploadedReport[];
  pendingAnalysis: number;
  period: string;
  onPeriodChange: (value: string) => void;
  onOpenSettings: () => void;
  onNavigate: (value: SectionId) => void;
}) {
  const [chartMetric, setChartMetric] = useState<"revenue" | "orders" | "profit">("revenue");
  const [planRevenue, setPlanRevenue] = useState("");
  const readyReports = reports.filter((report) => report.status === "ready");
  const errorReports = reports.length - readyReports.length;
  const sourceTypes = new Set(readyReports.map((report) => report.analytics?.kind).filter((kind) => kind && kind !== "generic")).size;
  const bounds = periodBounds(period);
  const hasSales = readyReports.some((report) => report.analytics?.kind === "sales" || report.analytics?.kind === "orders");
  const hasOrders = readyReports.some((report) => report.analytics?.kind === "orders" || report.analytics?.kind === "sales");
  const hasCatalog = readyReports.some((report) => report.analytics?.kind === "catalog" || report.analytics?.kind === "sales");
  const hasAds = readyReports.some((report) => report.analytics?.kind === "ads");
  const previousHasSales = previousAnalytics.metrics.revenue > 0;
  const previousHasOrders = previousAnalytics.metrics.orders > 0;
  const drr = analytics.metrics.adRevenue > 0 ? analytics.metrics.adSpend / analytics.metrics.adRevenue * 100 : 0;
  const previousDrr = previousAnalytics.metrics.adRevenue > 0 ? previousAnalytics.metrics.adSpend / previousAnalytics.metrics.adRevenue * 100 : null;
  const ctr = analytics.metrics.impressions > 0 ? analytics.metrics.clicks / analytics.metrics.impressions * 100 : null;
  const roas = analytics.metrics.adSpend > 0 ? analytics.metrics.adRevenue / analytics.metrics.adSpend : null;
  const lowStock = analytics.products.filter((product) => product.orders > 0 && (product.stock === 0 || (product.days > 0 && product.days <= 7))).length;
  const hasData = summary.files > 0;
  const periodNote = bounds ? `${new Date(`${bounds.start}T00:00:00`).toLocaleDateString("ru-RU")} — ${new Date(`${bounds.end}T00:00:00`).toLocaleDateString("ru-RU")}` : "Все доступные даты";
  const planKey = `sellerscope-month-plan-v1:${marketplace}:${period}`;
  useEffect(() => {
    const timer = window.setTimeout(() => setPlanRevenue(window.localStorage.getItem(planKey) ?? ""), 0);
    return () => window.clearTimeout(timer);
  }, [planKey]);
  const savePlan = (value: string) => {
    const normalized = value.replace(/[^\d]/g, "");
    setPlanRevenue(normalized);
    if (normalized) window.localStorage.setItem(planKey, normalized);
    else window.localStorage.removeItem(planKey);
  };
  const plan = Number(planRevenue) || 0;
  const planProgress = plan > 0 && hasSales ? Math.min(100, summary.revenue / plan * 100) : null;
  const chartData = analytics.daily.map((point, index) => ({
    ...point,
    current: chartMetric === "revenue" ? point.sales : chartMetric === "orders" ? point.orders : null,
    previous: chartMetric === "revenue" ? previousAnalytics.daily[index]?.sales ?? null : chartMetric === "orders" ? previousAnalytics.daily[index]?.orders ?? null : null,
  }));
  const chartAvailable = chartMetric !== "profit" && chartData.length > 0;
  const previousProducts = new Map(previousAnalytics.products.map((product) => [product.sku, product]));
  const topProducts = analytics.products.filter((product) => product.revenue > 0).slice(0, 5);
  const attentionItems = [
    ...(errorReports || pendingAnalysis ? [{ tone: "red", icon: "!", title: "Проверьте загруженные файлы", text: `${errorReports + pendingAnalysis} файлов требуют внимания`, section: "settings" as SectionId }] : []),
    ...(hasAds && drr > 18 ? [{ tone: "red", icon: "↘", title: `ДРР вырос до ${drr.toFixed(1).replace(".", ",")}%`, text: "Проверьте кампании с наибольшими расходами", section: "ads" as SectionId }] : []),
    ...(lowStock ? [{ tone: "orange", icon: "□", title: `Низкий остаток: ${lowStock} SKU`, text: "Пополните товары с активными продажами", section: "stocks" as SectionId }] : []),
    ...(!hasSales ? [{ tone: "purple", icon: "⇧", title: "Нет отчёта о продажах", text: "Загрузите продажи для расчёта основных показателей", section: "settings" as SectionId }] : []),
    ...(!hasAds ? [{ tone: "purple", icon: "◎", title: "Нет рекламного отчёта", text: "Загрузите продвижение для расчёта ДРР", section: "settings" as SectionId }] : []),
    ...(!hasCatalog ? [{ tone: "orange", icon: "◇", title: "Нет актуальных остатков", text: "Загрузите каталог или отчёт по складам", section: "settings" as SectionId }] : []),
  ].slice(0, 3);
  const todayItems = [
    ...(errorReports || pendingAnalysis ? [{ text: "Проверить файлы с ошибками", section: "settings" as SectionId }] : []),
    ...(lowStock ? [{ text: `Пополнить остатки для ${lowStock} SKU`, section: "stocks" as SectionId }] : []),
    ...(hasAds && drr > 18 ? [{ text: "Проверить рекламные кампании с высоким ДРР", section: "ads" as SectionId }] : []),
    ...(!hasSales ? [{ text: "Загрузить отчёт о продажах", section: "settings" as SectionId }] : []),
    ...(!hasCatalog ? [{ text: "Загрузить отчёт об остатках", section: "settings" as SectionId }] : []),
    ...(!hasAds ? [{ text: "Загрузить рекламный отчёт", section: "settings" as SectionId }] : []),
  ].slice(0, 4);
  const latestReport = readyReports[0];

  return (
    <div className="control-overview overview-v2">
      <section className="overview-commandbar" aria-label="Период и состояние данных">
        <div><span className={`overview-live-dot ${hasData ? "is-live" : ""}`}/><b>{hasData ? "Данные загружены" : "Данные не загружены"}</b><small>{sourceTypes} источника · {analytics.products.length} SKU</small></div>
        <label><span>Период</span><select value={period} onChange={(event) => onPeriodChange(event.target.value)}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <span className="overview-period-copy">{periodNote}</span>
        <button type="button" onClick={onOpenSettings}>Управление отчётами</button>
      </section>

      <section className="summary-card-grid overview-summary-grid" aria-label="Ключевые показатели">
        <SummaryCard tone="purple" icon="revenue" comparison={hasSales && previousHasSales ? percentChange(summary.revenue, previousSummary.revenue) : null} label="Выручка" value={hasSales ? money.format(summary.revenue) : "Нет данных"} note={hasSales ? "По отчёту выбранного периода" : "Загрузите отчёт о продажах"} />
        <SummaryCard tone="blue" icon="orders" comparison={hasOrders && previousHasOrders ? percentChange(summary.orders, previousSummary.orders) : null} label="Заказы" value={hasOrders ? `${number.format(summary.orders)} шт.` : "Нет данных"} note={hasOrders ? "Размещённые заказы" : "Загрузите отчёт о заказах"} />
        <SummaryCard tone="green" icon="buyouts" comparison={hasOrders && previousAnalytics.metrics.delivered > 0 ? percentChange(analytics.metrics.delivered, previousAnalytics.metrics.delivered) : null} label="Выкупы" value={hasOrders ? `${number.format(analytics.metrics.delivered)} шт.` : "Нет данных"} note={hasOrders ? "По подтверждённым доставкам" : "Нужны статусы заказов"} />
        <SummaryCard tone="cyan" icon="profit" comparison={null} label="Прибыль" value="Нет данных" note="Нужны финансы и себестоимость" comparisonLabel="расчёт недоступен" />
        <SummaryCard tone="orange" icon="margin" comparison={null} label="Маржа" value="Нет данных" note="Рассчитается вместе с прибылью" comparisonLabel="расчёт недоступен" />
        <SummaryCard tone="red" icon="ads" comparison={hasAds && previousAnalytics.metrics.adSpend > 0 ? percentChange(analytics.metrics.adSpend, previousAnalytics.metrics.adSpend) : null} label="Реклама" value={hasAds ? money.format(analytics.metrics.adSpend) : "Нет данных"} note={hasAds ? `ДРР ${drr.toFixed(1).replace(".", ",")}%` : "Загрузите рекламный отчёт"} inverse />
      </section>

      <section className="overview-primary-grid">
        <article className="overview-work-panel overview-dynamics">
          <div className="overview-panel-head"><div><h3>Динамика бизнеса</h3><p>Текущий и предыдущий сопоставимый месяц</p></div><div className="overview-metric-switch" role="group" aria-label="Показатель графика">{([ ["revenue", "Выручка"], ["orders", "Заказы"], ["profit", "Прибыль"] ] as const).map(([key, label]) => <button type="button" key={key} className={chartMetric === key ? "active" : ""} aria-pressed={chartMetric === key} onClick={() => setChartMetric(key)}>{label}</button>)}</div></div>
          {chartAvailable ? <div className="overview-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}><defs><linearGradient id="overviewArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9b4dff" stopOpacity={0.62}/><stop offset="100%" stopColor="#9b4dff" stopOpacity={0.03}/></linearGradient></defs><CartesianGrid stroke="#262b4a" vertical={false}/><XAxis dataKey="day" stroke="#8188a6" axisLine={false} tickLine={false} fontSize={11}/><YAxis stroke="#8188a6" axisLine={false} tickLine={false} fontSize={11} tickFormatter={(value) => chartMetric === "revenue" ? `${Math.round(Number(value) / 1000)}к` : number.format(Number(value))}/><Tooltip formatter={(value) => chartMetric === "revenue" ? money.format(Number(value)) : `${number.format(Number(value))} шт.`} contentStyle={{ background: "#11162d", border: "1px solid #343a63", borderRadius: 12 }}/><Area type="monotone" dataKey="current" name="Текущий период" stroke="#a94cff" strokeWidth={3} fill="url(#overviewArea)" connectNulls/><Line type="monotone" dataKey="previous" name="Прошлый период" stroke="#8a91b5" strokeWidth={2} strokeDasharray="6 7" dot={false} connectNulls/></ComposedChart></ResponsiveContainer></div> : <div className="overview-empty-chart"><SummaryIcon name={chartMetric === "profit" ? "profit" : chartMetric === "orders" ? "orders" : "revenue"}/><b>{chartMetric === "profit" ? "Прибыль пока не рассчитывается" : "Нет данных для графика"}</b><p>{chartMetric === "profit" ? "Загрузите финансовый отчёт и себестоимость проданных товаров." : "Загрузите отчёт с разбивкой по датам."}</p><button type="button" onClick={onOpenSettings}>Загрузить данные</button></div>}
        </article>

        <aside className="overview-work-panel overview-attention">
          <div className="overview-panel-head"><div><h3>Что требует внимания</h3><p>Три наиболее важных сигнала</p></div><span>{attentionItems.length}</span></div>
          <div className="overview-attention-list">{attentionItems.length ? attentionItems.map((item) => <button type="button" key={item.title} onClick={() => onNavigate(item.section)}><i className={`tone-${item.tone}`}>{item.icon}</i><span><b>{item.title}</b><small>{item.text}</small></span><em>›</em></button>) : <div className="overview-clear-state"><b>Критичных сигналов нет</b><p>По загруженным данным всё в пределах заданных правил.</p></div>}</div>
        </aside>
      </section>

      <section className="overview-secondary-grid">
        <article className="overview-work-panel overview-products"><div className="overview-panel-head"><div><h3>Топ-5 товаров по выручке</h3><p>Только товары выбранной площадки</p></div><button type="button" onClick={() => onNavigate("products")}>Все товары</button></div>{topProducts.length ? <div className="overview-product-list">{topProducts.map((product, index) => { const previous = previousProducts.get(product.sku); const change = previous ? percentChange(product.revenue, previous.revenue) : null; return <div key={product.sku}><span>{index + 1}</span><p><b>{product.name}</b><small>{product.sku}</small></p><strong>{money.format(product.revenue)}</strong><em className={change === null ? "neutral" : change >= 0 ? "positive" : "negative"}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}%`}</em></div>; })}</div> : <div className="overview-small-empty"><b>Нет данных о товарах</b><p>Загрузите отчёт о продажах с артикулами SKU.</p></div>}</article>

        <article className="overview-work-panel overview-ads"><div className="overview-panel-head"><div><h3>Эффективность рекламы</h3><p>Атрибуция {marketplaceMeta[marketplace].name}</p></div><button type="button" onClick={() => onNavigate("ads")}>Подробнее</button></div>{hasAds ? <dl><div><dt>Расход</dt><dd>{money.format(analytics.metrics.adSpend)}</dd></div><div><dt>Показы</dt><dd>{number.format(analytics.metrics.impressions)}</dd></div><div><dt>Клики</dt><dd>{number.format(analytics.metrics.clicks)}</dd></div><div><dt>CTR</dt><dd>{ctr === null ? "Нет данных" : `${ctr.toFixed(2).replace(".", ",")}%`}</dd></div><div><dt>ROAS</dt><dd>{roas === null ? "Нет данных" : roas.toFixed(2).replace(".", ",")}</dd></div><div><dt>ДРР</dt><dd className={drr > 18 ? "negative" : "positive"}>{drr.toFixed(1).replace(".", ",")}%{previousDrr === null ? "" : ` · ${drr - previousDrr >= 0 ? "+" : ""}${(drr - previousDrr).toFixed(1).replace(".", ",")} п.п.`}</dd></div></dl> : <div className="overview-small-empty"><b>Нет рекламных данных</b><p>Загрузите отчёт продвижения для расчёта ДРР, CTR и ROAS.</p></div>}</article>

        <article className="overview-work-panel overview-plan"><div className="overview-panel-head"><div><h3>План-факт месяца</h3><p>{period === "all" ? "Выберите один месяц" : periodOptions.find((item) => item.value === period)?.label}</p></div>{planProgress !== null && <span>{planProgress.toFixed(1).replace(".", ",")}%</span>}</div><label><span>План выручки</span><div><input inputMode="numeric" value={planRevenue} onChange={(event) => savePlan(event.target.value)} placeholder="Введите сумму"/><i>₽</i></div></label><div className="overview-plan-row"><span>Факт</span><b>{hasSales ? money.format(summary.revenue) : "Нет данных"}</b></div><div className="overview-plan-track"><i style={{ width: `${planProgress ?? 0}%` }}/></div><p>{plan ? (hasSales ? `До плана осталось ${money.format(Math.max(0, plan - summary.revenue))}` : "Загрузите продажи, чтобы увидеть выполнение плана") : "Введите реальный план — он сохранится только в этом браузере."}</p></article>

        <article className="overview-work-panel overview-today"><div className="overview-panel-head"><div><h3>Что сделать сегодня</h3><p>По текущим сигналам</p></div></div>{todayItems.length ? <div className="overview-task-list">{todayItems.map((item) => <button type="button" key={item.text} onClick={() => onNavigate(item.section)}><i/><span>{item.text}</span><em>›</em></button>)}</div> : <div className="overview-clear-state"><b>Срочных действий нет</b><p>Проверьте актуальность отчётов перед следующим рабочим днём.</p></div>}</article>
      </section>

      <footer className="overview-freshness"><div><span className={`overview-live-dot ${hasData ? "is-live" : ""}`}/><b>{hasData ? "Состояние данных" : "Ожидаются данные"}</b></div><span>Обновлено: {latestReport?.uploadedAt ?? "не обновлялось"}</span><span>Продажи: {hasSales ? "загружены" : "нет отчёта"}</span><span>Остатки: {hasCatalog ? "загружены" : "нет отчёта"}</span><span>Реклама: {hasAds ? "загружена" : "нет отчёта"}</span><button type="button" onClick={onOpenSettings}>Обновить данные</button></footer>
    </div>
  );
}

function Sales({ marketplace, summary, analytics }: { marketplace: MarketplaceId; summary: ImportSummary; analytics: DashboardAnalytics }) {
  const [chartMode, setChartMode] = useState<"bars" | "lines">("bars");
  const revenue = summary.revenue;
  const orders = summary.orders;
  const baseChartData = analytics.daily.length ? analytics.daily : trend;
  const dailyOrdersTotal = baseChartData.reduce((sum, point) => sum + point.orders, 0);
  const distributeDailyTotal = (total: number, key: "delivered" | "canceled" | "returned") => {
    const savedValues = baseChartData.map((point) => Number(point[key]) || 0);
    if (total === 0 || savedValues.some((value) => value > 0)) return savedValues;
    let assigned = 0;
    return baseChartData.map((point, index) => {
      if (index === baseChartData.length - 1) return Math.max(0, total - assigned);
      const share = dailyOrdersTotal ? point.orders / dailyOrdersTotal : 1 / baseChartData.length;
      const value = Math.round(total * share);
      assigned += value;
      return value;
    });
  };
  const dailyDelivered = distributeDailyTotal(analytics.metrics.delivered, "delivered");
  const dailyCanceled = distributeDailyTotal(analytics.metrics.canceled, "canceled");
  const dailyReturned = distributeDailyTotal(analytics.metrics.returned, "returned");
  const chartData = baseChartData.map((point, index) => ({ ...point, delivered: dailyDelivered[index], canceled: dailyCanceled[index], returned: dailyReturned[index], revenue: Math.round(point.sales / 1000) }));
  const chartSeries = [
    { key: "orders", name: "Заказы", color: "#377dff" },
    { key: "delivered", name: "Реализовано", color: "#c9e03a" },
    { key: "canceled", name: "Отменено", color: "#ff9e64" },
    { key: "returned", name: "Возвращено", color: "#a879ff" },
    { key: "revenue", name: "Выручка, тыс. ₽", color: "#ff5d9e" },
  ] as const;
  return (
    <>
      <section className="kpi-grid five">
        <Kpi label="Размещено заказов" value={number.format(orders)} note={summary.files ? "по загруженным строкам" : "ожидается отчёт"} tone="accent" />
        <Kpi label="Реализовано" value={number.format(analytics.metrics.delivered)} note="по статусам площадки" tone="positive" />
        <Kpi label="Отменено" value={number.format(analytics.metrics.canceled)} note="за выбранный период" tone="orange" />
        <Kpi label="Возвращено" value={number.format(analytics.metrics.returned)} note="за выбранный период" tone="purple" />
        <Kpi label="Выручка" value={money.format(revenue)} note={summary.files ? `импорт ${marketplaceMeta[marketplace].name}` : "ожидается отчёт"} tone="red" />
      </section>
      <section className="panel chart-panel">
        <div className="panel-head sales-chart-head">
          <div><h2>Продажи по дням</h2><p>Заказы, реализации, отмены, возвраты и выручка в единой цветовой системе</p></div>
          <div className="chart-controls">
            <span>По дням</span>
            <div className="chart-mode-switch" role="group" aria-label="Вид графика">
              <button type="button" className={chartMode === "bars" ? "active" : ""} aria-pressed={chartMode === "bars"} onClick={() => setChartMode("bars")}>Столбцы</button>
              <button type="button" className={chartMode === "lines" ? "active" : ""} aria-pressed={chartMode === "lines"} onClick={() => setChartMode("lines")}>Линии</button>
            </div>
          </div>
        </div>
        <div className="sales-chart-legend" aria-label="Обозначения графика">
          {chartSeries.map((series) => <span key={series.key}><i style={{ background: series.color }} />{series.name}</span>)}
        </div>
        <div className="chart-wrap medium">
          {chartMode === "bars" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid stroke="#2b3b53" vertical={false}/><XAxis dataKey="day" stroke="#7890ad" axisLine={false} tickLine={false} fontSize={11}/><YAxis stroke="#7890ad" axisLine={false} tickLine={false} fontSize={11}/>
                <Tooltip contentStyle={{ background: "#182438", border: "1px solid #344762", borderRadius: 12 }} />
                {chartSeries.map((series) => <Bar key={series.key} name={series.name} dataKey={series.key} fill={series.color} radius={[4,4,0,0]} maxBarSize={18} />)}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: -20, right: 12 }}>
                <CartesianGrid stroke="#2b3b53" vertical={false}/><XAxis dataKey="day" stroke="#7890ad" axisLine={false} tickLine={false} fontSize={11}/><YAxis stroke="#7890ad" axisLine={false} tickLine={false} fontSize={11}/>
                <Tooltip contentStyle={{ background: "#182438", border: "1px solid #344762", borderRadius: 12 }} />
                {chartSeries.map((series) => <Line key={series.key} type="monotone" name={series.name} dataKey={series.key} stroke={series.color} strokeWidth={3} dot={false} activeDot={{ r: 4 }} />)}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Операции</h2><p>Исходные идентификаторы сохранены для сверки</p></div><button className="secondary-button">Экспорт CSV</button></div>
        <div className="table-scroll"><table><thead><tr><th>Дата</th><th>Событие</th><th>Маркетплейс</th><th>Товар</th><th>ID источника</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>
          <tr className="empty-row"><td colSpan={7}>Нет операций. Загрузите отчёт выбранного магазина.</td></tr>
        </tbody></table></div>
      </section>
    </>
  );
}

function ProductTable({ compact = false, marketplace, rows = [] }: { compact?: boolean; marketplace?: MarketplaceId; rows?: ProductRow[] }) {
  const visibleProducts = marketplace ? rows.filter((product) => product.market === (marketplace === "ozon" ? "Ozon" : "WB")) : rows;
  return <div className="table-scroll"><table><thead><tr><th>Товар</th><th>Площадка</th><th>Заказы</th><th>Выручка</th><th>Маржа</th><th>Запас</th><th>Рейтинг</th></tr></thead><tbody>
    {visibleProducts.length ? visibleProducts.slice(0, compact ? 3 : visibleProducts.length).map((product) => <tr key={product.sku}><td><div className="product-cell"><span className="product-thumb">{product.name.slice(0,1)}</span><div><b>{product.name}</b><small>{product.sku}</small></div></div></td><td><span className={`market market-${product.market.toLowerCase()}`}>{product.market}</span></td><td>{number.format(product.orders)}</td><td>{money.format(product.revenue)}</td><td>{product.margin === null ? <span className="unknown">Нет себестоимости</span> : `${product.margin}%`}</td><td><b className={product.days <= 5 ? "danger-text" : ""}>{product.stock} шт.</b><small className="cell-note">≈ {product.days} дней</small></td><td><span className={`score score-${product.score < 50 ? "low" : product.score < 75 ? "mid" : "high"}`}>{product.score}</span></td></tr>) : <tr className="empty-row"><td colSpan={7}>Нет товаров. Загрузите отчёт по товарам или остаткам.</td></tr>}
  </tbody></table></div>;
}

function Products({ marketplace, analytics, onAddProduct }: { marketplace: MarketplaceId; analytics: DashboardAnalytics; onAddProduct: (product: ProductRow) => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productStock, setProductStock] = useState("0");
  const [formError, setFormError] = useState("");
  const visible = analytics.products.filter((product) => product.market === (marketplace === "ozon" ? "Ozon" : "WB"));
  const top = visible[0];
  const lowStock = [...visible].filter((product) => product.orders > 0 && product.stock > 0).sort((a, b) => a.days - b.days)[0];
  const closeDialog = () => { setDialogOpen(false); setFormError(""); };
  const saveProduct = (event: React.FormEvent) => {
    event.preventDefault();
    const name = productName.trim();
    const sku = productSku.trim();
    if (!name || !sku) { setFormError("Заполните название и артикул товара."); return; }
    if (visible.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) { setFormError("Товар с таким артикулом уже есть в выбранном магазине."); return; }
    const stock = Math.max(0, Math.round(Number(productStock) || 0));
    onAddProduct({ sku, name, market: marketplace === "ozon" ? "Ozon" : "WB", orders: 0, revenue: 0, margin: null, stock, reserved: 0, inTransit: 0, days: 0, score: 25 });
    setProductName(""); setProductSku(""); setProductStock("0"); closeDialog();
  };
  return <>
    <section className="toolbar-row"><div className="search"><span>⌕</span><input placeholder="Название, артикул или ID площадки" /></div><select aria-label="Категория"><option>Все категории</option></select><button className="secondary-button">Соответствия SKU</button></section>
    <section className="panel"><div className="panel-head"><div><h2>{visible.length} товаров</h2><p>{marketplaceMeta[marketplace].name} · выбранный магазин</p></div><button className="primary-button" onClick={()=>setDialogOpen(true)}>Добавить товар</button></div><ProductTable marketplace={marketplace} rows={visible} /></section>
    <section className="insight-strip"><div><span>Лидер по выручке</span><b>{top?.name ?? "Нет данных"}</b><small>{top ? money.format(top.revenue) : "Загрузите отчёт по продажам"}</small></div><div><span>Минимальный запас</span><b>{lowStock?.name ?? "Нет данных"}</b><small>{lowStock ? `${lowStock.stock} шт. · примерно ${lowStock.days} дней` : "Загрузите отчёт по остаткам"}</small></div><div><span>Сопоставление</span><b>{visible.length} SKU обработано</b><small>Продажи и остатки объединены по SKU</small></div></section>
    {dialogOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event)=>{ if (event.currentTarget === event.target) closeDialog(); }}><form className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="add-product-title" onSubmit={saveProduct}><div className="dialog-head"><div><h2 id="add-product-title">Добавить товар</h2><p>{marketplaceMeta[marketplace].name} · ручное добавление</p></div><button type="button" className="icon-button" onClick={closeDialog} aria-label="Закрыть форму">×</button></div><label><span>Название товара</span><input autoFocus value={productName} onChange={(event)=>setProductName(event.target.value)} placeholder="Например, Лакомство для собак" maxLength={160} /></label><label><span>Артикул или SKU</span><input value={productSku} onChange={(event)=>setProductSku(event.target.value)} placeholder="Введите уникальный артикул" maxLength={80} /></label><label><span>Текущий остаток, шт.</span><input type="number" min="0" step="1" value={productStock} onChange={(event)=>setProductStock(event.target.value)} /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={closeDialog}>Отмена</button><button type="submit" className="primary-button">Сохранить товар</button></div></form></div>}
  </>;
}

function Ads({ marketplace, analytics }: { marketplace: MarketplaceId; analytics: DashboardAnalytics }) {
  const visibleCampaigns = analytics.campaigns;
  const drr = analytics.metrics.adRevenue ? analytics.metrics.adSpend / analytics.metrics.adRevenue * 100 : 0;
  const roas = analytics.metrics.adSpend ? analytics.metrics.adRevenue / analytics.metrics.adSpend : 0;
  const ctr = analytics.metrics.impressions ? analytics.metrics.clicks / analytics.metrics.impressions * 100 : 0;
  return <><div className="notice"><span>i</span><div><b>Показаны метрики только {marketplaceMeta[marketplace].name}</b><p>{visibleCampaigns.length ? "Расходы и продажи рассчитаны по загруженному отчёту продвижения." : "Показатели заполнятся после загрузки рекламного отчёта."}</p></div></div><section className="kpi-grid five"><Kpi label="Расходы" value={money.format(analytics.metrics.adSpend)} note={marketplaceMeta[marketplace].name} tone="accent"/><Kpi label="Показы" value={number.format(analytics.metrics.impressions)} note="из отчёта продвижения" tone="positive"/><Kpi label="Клики" value={number.format(analytics.metrics.clicks)} note={`CTR ${ctr.toFixed(2)}%`} tone="orange"/><Kpi label="ДРР" value={`${drr.toFixed(1)}%`} note="расход / атриб. выручка" tone="purple"/><Kpi label="ROAS" value={roas.toFixed(2)} note="атриб. выручка / расход" tone="red"/></section><section className="panel"><div className="panel-head"><div><h2>Кампании</h2><p>Цель ДРР: 18%</p></div><button className="secondary-button">Настроить цели</button></div><div className="table-scroll"><table><thead><tr><th>Кампания</th><th>Расход</th><th>Атриб. выручка</th><th>ДРР</th><th>ROAS</th><th>Состояние</th></tr></thead><tbody>{visibleCampaigns.length ? visibleCampaigns.map((c)=><tr key={c.name}><td><b>{c.name}</b></td><td>{money.format(c.spend)}</td><td>{c.revenue === null ? <span className="unknown">Нет данных</span> : money.format(c.revenue)}</td><td>{c.drr === null ? "—" : `${c.drr.toFixed(1)}%`}</td><td>{c.roas === null ? "—" : c.roas.toFixed(2)}</td><td><Status tone={c.status === "Выше цели" ? "warn" : "ok"}>{c.status}</Status></td></tr>) : <tr className="empty-row"><td colSpan={6}>Нет кампаний. Загрузите рекламный отчёт.</td></tr>}</tbody></table></div></section></>;
}

function Stocks({ marketplace, analytics }: { marketplace: MarketplaceId; analytics: DashboardAnalytics }) {
  const market = marketplace === "ozon" ? "Ozon" : "WB";
  const visibleStocks = analytics.products.filter((product) => product.market === market);
  const available = visibleStocks.reduce((sum, product) => sum + product.stock, 0);
  const reserved = visibleStocks.reduce((sum, product) => sum + product.reserved, 0);
  const inTransit = visibleStocks.reduce((sum, product) => sum + product.inTransit, 0);
  return <><section className="kpi-grid"><Kpi label="Доступно к продаже" value={`${available} шт.`} note="не включая резерв" tone="accent"/><Kpi label="В резерве" value={`${reserved} шт.`} note="показано отдельно" tone="positive"/><Kpi label="В пути" value={`${inTransit} шт.`} note="подтверждённые поставки" tone="orange"/><Kpi label="Закончатся ≤ 7 дней" value={`${visibleStocks.filter((product) => product.orders > 0 && product.stock > 0 && product.days <= 7).length} SKU`} note="по выбранному магазину" tone="purple"/></section><section className="panel"><div className="panel-head"><div><h2>Запасы по товарам</h2><p>Прогноз рассчитан по продажам выбранного периода</p></div><button className="secondary-button">По складам</button></div><div className="table-scroll"><table><thead><tr><th>Товар</th><th>Схема</th><th>Доступно</th><th>Резерв</th><th>В пути</th><th>Прогноз</th><th>Состояние</th></tr></thead><tbody>{visibleStocks.length ? visibleStocks.map((p)=><tr key={p.sku}><td><b>{p.name}</b><small className="cell-note">{p.sku}</small></td><td>{p.market === "WB" ? "FBW" : "FBO / FBS"}</td><td>{p.stock} шт.</td><td>{p.reserved} шт.</td><td>{p.inTransit} шт.</td><td>{p.days === 0 ? "Нет расчёта" : `≈ ${p.days} дней`}</td><td><Status tone={p.stock === 0 ? "bad" : p.days > 0 && p.days <= 7 ? "warn" : "ok"}>{p.stock === 0 ? "Нет в продаже" : p.days > 0 && p.days <= 7 ? "Малый запас" : "В норме"}</Status></td></tr>) : <tr className="empty-row"><td colSpan={7}>Нет данных об остатках. Загрузите отчёт.</td></tr>}</tbody></table></div></section></>;
}

function Finance({ summary, analytics }: { summary: ImportSummary; analytics: DashboardAnalytics }) {
  const contribution = Math.max(0, summary.revenue - analytics.metrics.adSpend);
  const margin = summary.revenue ? contribution / summary.revenue * 100 : 0;
  return <><div className="profit-bridge"><div className="bridge-item finance-tone-blue"><span>Выручка</span><b>{money.format(summary.revenue)}</b></div><i>−</i><div className="bridge-item finance-tone-lime"><span>Комиссии и логистика</span><b>Нет отчёта</b></div><i>−</i><div className="bridge-item finance-tone-orange"><span>Реклама</span><b>{money.format(analytics.metrics.adSpend)}</b></div><i>−</i><div className="bridge-item finance-tone-purple"><span>Себестоимость</span><b>Не задана</b></div><i>=</i><div className="bridge-item result finance-tone-pink"><span>До комиссий и себестоимости</span><b>{money.format(contribution)}</b><small>после рекламы · {margin.toFixed(1)}%</small></div></div><section className="finance-grid"><article className="panel"><div className="panel-head"><div><h2>План / факт</h2><p>План не задан</p></div><span className="plan-percent">0%</span></div><div className="progress"><i style={{ width: "0%" }}/></div><div className="plan-values"><span><b>{money.format(summary.revenue)}</b> факт</span><span><b>{money.format(0)}</b> план</span></div><div className="chart-wrap small"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.daily.length ? analytics.daily : trend}><Area type="monotone" dataKey="sales" stroke="#AD8EFF" fill="#AD8EFF22"/><XAxis dataKey="day" hide/><YAxis hide/></AreaChart></ResponsiveContainer></div></article><article className="panel cost-panel"><div className="panel-head"><div><h2>Себестоимость</h2><p>Покрытие: 0 SKU</p></div><Status tone="muted">0%</Status></div><div className="drop-zone"><span>⇧</span><b>Загрузить Excel или CSV</b><p>Добавьте себестоимость для расчёта чистой прибыли</p><button className="secondary-button">Выбрать файл</button></div></article></section><section className="panel"><div className="panel-head"><div><h2>Начисления и удержания</h2><p>Заполнятся после импорта финансового отчёта</p></div><div className="button-row"><button className="secondary-button">Добавить расход</button><button className="primary-button">Экспорт отчёта</button></div></div><div className="breakdown"><div><span>Комиссии</span><b>Нет данных</b><i style={{width:"0%"}}/></div><div><span>Логистика</span><b>Нет данных</b><i style={{width:"0%"}}/></div><div><span>Реклама</span><b>{money.format(analytics.metrics.adSpend)}</b><i style={{width:summary.revenue ? `${Math.min(100, analytics.metrics.adSpend / summary.revenue * 100)}%` : "0%"}}/></div><div><span>Прочие удержания</span><b>Нет данных</b><i style={{width:"0%"}}/></div></div></section></>;
}

function Alerts({ marketplace, analytics }: { marketplace: MarketplaceId; analytics: DashboardAnalytics }) {
  const drr = analytics.metrics.adRevenue ? analytics.metrics.adSpend / analytics.metrics.adRevenue * 100 : 0;
  const outOfStock = analytics.products.filter((product) => product.orders > 0 && product.stock === 0);
  const lowStock = analytics.products.filter((product) => product.orders > 0 && product.stock > 0 && product.days <= 7);
  const alerts = [
    ...(drr > 18 ? [{ tone: "warn" as const, title: "ДРР выше цели", text: `${drr.toFixed(1)}% при ориентире 18%. Проверьте кампании с наибольшими расходами.` }] : []),
    ...(outOfStock.length ? [{ tone: "bad" as const, title: "Товары закончились", text: `${outOfStock.length} SKU с продажами периода сейчас недоступны к продаже.` }] : []),
    ...(lowStock.length ? [{ tone: "warn" as const, title: "Малый запас", text: `${lowStock.length} SKU могут закончиться в течение 7 дней.` }] : []),
  ];
  return <><section className="alert-layout"><div className="panel alert-list"><div className="panel-head"><div><h2>Журнал событий</h2><p>{alerts.length} {alerts.length === 1 ? "сигнал" : "сигнала"} · {marketplaceMeta[marketplace].name}</p></div></div>{alerts.length ? alerts.map((alert)=><div className="alert-row" key={alert.title}><span className={`alert-dot alert-${alert.tone}`}>!</span><div><b>{alert.title}</b><p>{alert.text}</p><small>По отчётам выбранного периода</small></div></div>) : <div className="import-empty"><span>0</span><b>Уведомлений пока нет</b><p>Сигналы появятся после загрузки и анализа отчётов.</p></div>}</div><aside className="panel rules"><div className="panel-head"><div><h2>Правила</h2><p>3 системных проверки</p></div></div>{[["Малый остаток","≤ 7 дней"],["Целевой ДРР","18%"],["Отсутствие товара","0 шт."]].map(([a,b])=><div className="rule" key={a}><span><b>{a}</b><small>{b}</small></span><button className="toggle on" aria-label={`Отключить ${a}`}><i/></button></div>)}<button className="secondary-button full">Настроить правила</button></aside></section></>;
}

function Settings() {
  return <div className="settings-grid"><section className="panel settings-main"><div className="settings-block"><div className="panel-head"><div><h2>Организация</h2><p>Рабочее пространство и доступ команды</p></div><button className="secondary-button">Изменить</button></div><div className="org-card"><span className="org-mark">М</span><div><b>Рабочий магазин</b><small>Europe/Minsk · RUB</small></div><Status>Активен</Status></div></div><div className="settings-block"><div className="panel-head"><div><h2>Подключения</h2><p>Секреты зашифрованы и не показываются в браузере</p></div><button className="primary-button">Подключить магазин</button></div>{[["Wildberries","Основной магазин","10:32","ok"],["Ozon Seller","Магазин Ozon","10:28","ok"],["Ozon Performance","Реклама Ozon","04:17","warn"],["WB Promotion","Реклама WB","10:14","ok"]].map(([name,store,time,tone])=><div className="connection" key={name}><span className={`connector-logo ${name.startsWith("Ozon") ? "ozon" : "wb"}`}>{name[0]}</span><div><b>{name}</b><small>{store}</small></div><div className="connection-state"><Status tone={tone as "ok"|"warn"}>{tone === "ok" ? "Подключено" : "Задержка"}</Status><small>Последнее обновление {time}</small></div><button className="icon-button">•••</button></div>)}</div><div className="settings-block"><div className="panel-head"><div><h2>Команда</h2><p>Рабочие учётные записи</p></div><button className="secondary-button">Пригласить</button></div><div className="team-row"><span className="avatar">П</span><div><b>Пользователь</b><small>Рабочая учётная запись</small></div><span>Владелец</span></div></div></section><aside className="panel audit"><div className="panel-head"><div><h2>Обновления</h2><p>Последние задания</p></div></div>{[["Заказы WB","Успешно","10:32","ok"],["Остатки Ozon","Успешно","10:28","ok"],["Реклама Ozon","Повтор через 18 мин","10:17","warn"],["Финансы WB","Успешно","03:05","ok"]].map(([name,status,time,tone])=><div className="job" key={name}><i className={`job-${tone}`}/><span><b>{name}</b><small>{status}</small></span><time>{time}</time></div>)}<button className="secondary-button full">Открыть журнал</button><div className="security-note"><b>Безопасность подключений</b><p>Ключи не сохраняются в Git и не попадают в журналы. Для коммерческих подключений Ozon приоритетен OAuth.</p></div></aside></div>;
}

void Settings;

function ImportCenter({ marketplace, reports, importing, onFiles, onRemove, onPeriodChange }: {
  marketplace: MarketplaceId;
  reports: UploadedReport[];
  importing: boolean;
  onFiles: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onPeriodChange: (id: string, periodKey: string) => void;
}) {
  const meta = marketplaceMeta[marketplace];
  const successful = reports.filter((report) => report.status === "ready");
  const [mode, setMode] = useState<"files" | "api">("files");
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [apiState, setApiState] = useState<{ tone: "idle" | "loading" | "ok" | "error"; message: string }>({ tone: "idle", message: "Ключ хранится только во время проверки" });
  const connectApi = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiState({ tone: "loading", message: "Проверяем доступ к площадке…" });
    try {
      const response = await fetch("/api/marketplace/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace, clientId, apiKey, token }),
      });
      const result = await response.json() as { connected?: boolean; message?: string };
      if (!response.ok || !result.connected) throw new Error(result.message ?? "Ключ не прошёл проверку");
      setApiState({ tone: "ok", message: result.message ?? "Соединение подтверждено" });
      setApiKey("");
      setToken("");
    } catch (error) {
      setApiState({ tone: "error", message: error instanceof Error ? error.message : "Не удалось проверить ключ" });
    }
  };
  return (
    <>
      <div className="data-path-switch" role="tablist" aria-label="Способ получения данных">
        <button role="tab" aria-selected={mode === "files"} className={mode === "files" ? "active" : ""} onClick={() => setMode("files")}><span>⇧</span><b>Загрузить отчёты</b><small>CSV, JSON или XLSX</small></button>
        <button role="tab" aria-selected={mode === "api"} className={mode === "api" ? "active" : ""} onClick={() => setMode("api")}><span>⌁</span><b>Подключить API</b><small>Автоматическое получение данных</small></button>
      </div>
      {mode === "files" ? <>
      <div className="import-grid">
        <section className="panel import-panel">
          <div className="panel-head"><div><h2>Загрузить отчёты {meta.name}</h2><p>Файлы обрабатываются локально и не отправляются на сервер</p></div><span className={`market-badge market-badge-${marketplace}`}>{meta.short}</span></div>
          <label className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFiles(Array.from(event.dataTransfer.files)); }}>
            <input type="file" multiple accept=".csv,.txt,.json,.xlsx" onChange={(event) => { if (event.target.files) onFiles(event.target.files); event.target.value = ""; }} />
            <span>⇧</span>
            <b>{importing ? "Разбираем файлы…" : "Перетащите выгрузки сюда"}</b>
            <p>или нажмите, чтобы выбрать CSV, JSON или XLSX</p>
            <i>Загрузить документы</i>
          </label>
        </section>
        <aside className="panel import-guide">
          <div className="panel-head"><div><h2>Что загрузить</h2><p>Подойдут стандартные выгрузки из кабинета</p></div></div>
          {[
            ["Продажи", "заказы, реализации, возвраты"],
            ["Остатки", "товары и склады"],
            ["Реклама", "кампании и расходы"],
            ["Финансы", "комиссии и удержания"],
          ].map(([title, text]) => <div className="import-hint" key={title}><i>✓</i><span><b>{title}</b><small>{text}</small></span></div>)}
        </aside>
      </div>
      <section className="panel import-history">
        <div className="panel-head"><div><h2>Загруженные документы</h2><p>{successful.length ? `${successful.length} файлов распознано` : `Для ${meta.name} пока нет файлов`}</p></div></div>
        {reports.length ? <div className="table-scroll"><table><thead><tr><th>Файл</th><th>Период отчёта</th><th>Тип отчёта</th><th>Строк</th><th>Заказы</th><th>Выручка</th><th>Статус</th><th /></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td><b>{report.name}</b><small className="cell-note">{report.uploadedAt}</small></td><td><select className="report-period" value={report.periodKey} onChange={(event) => onPeriodChange(report.id, event.target.value)} aria-label={`Период файла ${report.name}`}>{periodOptions.filter((option) => option.value !== "all").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td><td>{report.kind}</td><td>{number.format(report.rows)}</td><td>{number.format(report.orders)}</td><td>{report.revenue ? money.format(report.revenue) : "—"}</td><td>{report.status === "ready" && report.analytics?.kind !== "generic" ? <Status tone="ok">Анализ готов</Status> : report.status === "ready" ? <Status tone="warn">Загрузите повторно</Status> : <Status tone="bad">{report.message ?? "Ошибка"}</Status>}</td><td><button className="icon-button" onClick={() => onRemove(report.id)} aria-label={`Удалить ${report.name}`}>×</button></td></tr>)}</tbody></table></div> : <div className="import-empty"><span>{meta.short}</span><b>Добавьте первую выгрузку</b><p>После обработки сводные показатели выбранного магазина обновятся автоматически.</p></div>}
      </section>
      </> : <div className="api-connect-grid">
        <form className="panel api-form" onSubmit={connectApi}>
          <div className="panel-head"><div><h2>Подключить {meta.name} API</h2><p>Проверка выполняется сервером SellerScope</p></div><span className={`market-badge market-badge-${marketplace}`}>{meta.short}</span></div>
          {marketplace === "ozon" ? <>
            <label><span>Client-Id</span><input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Идентификатор продавца" autoComplete="off" required /></label>
            <label><span>Api-Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Ключ Seller API" autoComplete="new-password" required /></label>
          </> : <label><span>Токен Wildberries</span><textarea value={token} onChange={(event) => setToken(event.target.value)} placeholder="Вставьте API-токен с правами на аналитику" autoComplete="off" required /></label>}
          <div className={`api-state api-state-${apiState.tone}`}><i /> <span>{apiState.message}</span></div>
          <button className="primary-button api-submit" type="submit" disabled={apiState.tone === "loading"}>{apiState.tone === "loading" ? "Проверяем…" : "Проверить и подключить"}</button>
        </form>
        <aside className="panel api-security">
          <div className="panel-head"><div><h2>Безопасное подключение</h2><p>Что произойдёт после проверки</p></div></div>
          <div className="api-step"><span>1</span><div><b>Проверка доступа</b><p>Ключ отправляется только серверному маршруту и не записывается в браузер.</p></div></div>
          <div className="api-step"><span>2</span><div><b>Синхронизация</b><p>Продажи, остатки, реклама и финансы будут загружаться раздельно.</p></div></div>
          <div className="api-step"><span>3</span><div><b>Аналитика</b><p>Показатели обновятся в тех же графиках, что и при загрузке файлов.</p></div></div>
          <div className="security-note"><b>Текущий прототип</b><p>Ключ не сохраняется после проверки. Для фоновой синхронизации потребуется зашифрованное серверное хранилище.</p></div>
        </aside>
      </div>}
    </>
  );
}

function ReportSection({ id, title, subtitle, children }: { id: SectionId; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section id={`section-${id}`} className="report-section" aria-labelledby={`heading-${id}`} tabIndex={-1}>
      <div className="report-section-head">
        <div>
          <h2 id={`heading-${id}`}>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <a href="#report-top">Наверх ↑</a>
      </div>
      {children}
    </section>
  );
}

export function Dashboard() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [period, setPeriod] = useState("2026-10");
  const [marketplace, setMarketplace] = useState<MarketplaceId>("ozon");
  const [storeName, setStoreName] = useState("Мой магазин");
  const [manualProducts, setManualProducts] = useState<ProductRow[]>([]);
  const [reports, setReports] = useState<UploadedReport[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("sellerscope-reports-v3");
        if (stored) {
          const saved = JSON.parse(stored) as Array<Omit<UploadedReport, "periodKey"> & { periodKey?: string }>;
          setReports(saved.map((report) => ({
            ...report,
            periodKey: report.periodKey ?? periodFromFileName(report.name) ?? "2026-10",
          })));
        }
      } catch { /* damaged local data starts with an empty import history */ }
      setReportsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (reportsLoaded) window.localStorage.setItem("sellerscope-reports-v3", JSON.stringify(reports));
  }, [reports, reportsLoaded]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedName = window.localStorage.getItem("sellerscope-store-name")?.trim();
      if (savedName) setStoreName(savedName);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem("sellerscope-manual-products-v1") ?? "[]");
        if (Array.isArray(stored)) setManualProducts(stored as ProductRow[]);
      } catch { /* damaged manual product data is ignored */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const updateStoreName = (value: string) => {
    const nextName = value.slice(0, 60);
    setStoreName(nextName);
    if (nextName.trim()) window.localStorage.setItem("sellerscope-store-name", nextName.trim());
    else window.localStorage.removeItem("sellerscope-store-name");
  };
  const addManualProduct = (product: ProductRow) => {
    setManualProducts((current) => {
      const next = [...current, product];
      window.localStorage.setItem("sellerscope-manual-products-v1", JSON.stringify(next));
      return next;
    });
  };
  const marketReports = reports.filter((report) => report.marketplace === marketplace);
  const periodReports = period === "all" ? marketReports : marketReports.filter((report) => report.periodKey === period);
  const analytics = combineAnalytics(periodReports.filter((report) => report.status === "ready"));
  const previousPeriod = previousPeriodKey(period);
  const previousReports = previousPeriod ? marketReports.filter((report) => report.periodKey === previousPeriod && report.status === "ready") : [];
  const previousAnalytics = combineAnalytics(previousReports);
  const previousStoredSummary = previousReports.reduce<ImportSummary>((total, report) => ({
    files: total.files + 1,
    rows: total.rows + report.rows,
    revenue: total.revenue + report.revenue,
    orders: total.orders + report.orders,
  }), { files: 0, rows: 0, revenue: 0, orders: 0 });
  const previousSummary = {
    ...previousStoredSummary,
    revenue: previousAnalytics.metrics.revenue || previousStoredSummary.revenue,
    orders: previousAnalytics.metrics.orders || previousStoredSummary.orders,
  };
  const selectedProductMarket = marketplace === "ozon" ? "Ozon" : "WB";
  const importedProductKeys = new Set(analytics.products.map((product) => `${product.market}:${product.sku.toLowerCase()}`));
  const currentManualProducts = manualProducts.filter((product) => product.market === selectedProductMarket && !importedProductKeys.has(`${product.market}:${product.sku.toLowerCase()}`));
  const viewAnalytics = { ...analytics, products: [...analytics.products, ...currentManualProducts] };
  const pendingAnalysis = periodReports.filter((report) => report.status === "ready" && (!report.analytics || report.analytics.kind === "generic")).length;
  const storedSummary = periodReports.filter((report) => report.status === "ready").reduce<ImportSummary>((total, report) => ({
    files: total.files + 1,
    rows: total.rows + report.rows,
    revenue: total.revenue + report.revenue,
    orders: total.orders + report.orders,
  }), { files: 0, rows: 0, revenue: 0, orders: 0 });
  const summary = { ...storedSummary, revenue: analytics.metrics.revenue || storedSummary.revenue, orders: analytics.metrics.orders || storedSummary.orders };
  const handleFiles = async (files: FileList | File[]) => {
    setImporting(true);
    const uploadedAt = new Date().toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const parsedReports = await Promise.all(Array.from(files).map(async (file, index): Promise<UploadedReport> => {
      const id = `${Date.now()}-${index}-${file.name}`;
      try {
        const rows = await rowsFromFile(file);
        const parsed = summarizeRows(rows);
        const reportAnalytics = analyticsFromRows(rows, marketplace);
        const rowCount = reportAnalytics.sourceRows || parsed.rows;
        if (!rowCount) throw new Error("В файле нет строк данных");
        const kind = reportAnalytics.kind === "ads" ? "Реклама" : reportAnalytics.kind === "catalog" ? "Остатки" : reportKind(file.name, parsed.headers);
        return { id, marketplace, name: file.name, kind, rows: rowCount, revenue: reportAnalytics.metrics.revenue || parsed.revenue, orders: Math.round(reportAnalytics.metrics.orders || parsed.orders), periodKey: inferReportPeriod(rows, file.name, period === "all" ? "2026-11" : period, reportAnalytics.kind), analytics: reportAnalytics, uploadedAt, status: "ready" };
      } catch (error) {
        return { id, marketplace, name: file.name, kind: "Не определён", rows: 0, revenue: 0, orders: 0, periodKey: period === "all" ? "2026-11" : period, uploadedAt, status: "error", message: error instanceof Error ? error.message : "Не удалось прочитать файл" };
      }
    }));
    setReports((current) => [...parsedReports, ...current.filter((report) => !parsedReports.some((fresh) => fresh.marketplace === report.marketplace && fresh.name === report.name))]);
    setImporting(false);
  };
  const go = (id: SectionId) => {
    setActiveSection(id);
    setMenuOpen(false);
    const target = document.getElementById(`section-${id}`);
    if (!target) return;
    window.history.replaceState(null, "", `#section-${id}`);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.focus({ preventScroll: true });
      });
    });
  };
  return (
    <div className="app-shell" data-theme="bento">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><i/><i/><i/></span><div><b>SellerScope</b><small>Analytics</small></div><button className="close-menu" onClick={()=>setMenuOpen(false)}>×</button></div>
        <div className="demo-badge"><span>{marketplaceMeta[marketplace].short}</span><p>{summary.files ? `Загружено ${fileCount(summary.files)}` : "Ожидается импорт отчётов"}</p></div>
        <nav aria-label="Оглавление итогового листа">{sections.map(item=><a key={item.id} href={`#section-${item.id}`} className={activeSection === item.id ? "active" : ""} onClick={(event)=>{ event.preventDefault(); go(item.id); }} aria-current={activeSection === item.id ? "location" : undefined}><span>{item.icon}</span>{item.label}</a>)}</nav>
        <div className="sidebar-foot"><button><span>?</span>Помощь и документация</button></div>
      </aside>
      {menuOpen && <button className="scrim" onClick={()=>setMenuOpen(false)} aria-label="Закрыть меню"/>}
      <div className="workspace">
        <header className="topbar"><button className="menu-button" onClick={()=>setMenuOpen(true)}>☰</button><div className="marketplace-switch topbar-marketplace-switch" role="group" aria-label="Выбор магазина"><button className={marketplace === "ozon" ? "active ozon" : ""} onClick={()=>setMarketplace("ozon")}><i>OZ</i><span>Ozon</span></button><button className={marketplace === "wb" ? "active wb" : ""} onClick={()=>setMarketplace("wb")}><i>WB</i><span>Wildberries</span></button></div><div className="topbar-spacer"/><label className="period"><span>◷</span><select value={period} onChange={(e)=>setPeriod(e.target.value)}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="notification-button" onClick={()=>go("alerts")}>!</button></header>
        <main id="report-top">
          <div className="page-heading report-heading overview-page-heading"><div><p>Центр управления продажами</p><h1>Управление магазином</h1><span>Продажи, реклама, финансы и остатки в одном рабочем экране</span></div><div className="overview-heading-actions"><label className="store-name-field"><span>Название магазина</span><input value={storeName} onChange={(event)=>updateStoreName(event.target.value)} onBlur={(event)=>updateStoreName(event.target.value.trim() || "Мой магазин")} placeholder="Введите название" aria-label="Название магазина" /></label><span className={`market-badge market-badge-${marketplace}`}>{marketplaceMeta[marketplace].name}</span><button className="primary-button" onClick={()=>go("settings")}>+ Загрузить отчёты</button></div></div>
          {pendingAnalysis > 0 && <div className="notice reimport-notice"><span>!</span><div><b>Обновите анализ ранее загруженных файлов</b><p>Загрузите те же отчёты повторно в разделе «Источники данных». Старые записи заменятся автоматически, а графики, товары, реклама и остатки заполнятся.</p></div><button className="primary-button" onClick={()=>go("settings")}>К загрузке</button></div>}
          <div className="report-stack">
            <ReportSection id="overview" title="Обзор" subtitle="Главные показатели и готовность данных за выбранный период">
              <OverviewDashboard marketplace={marketplace} summary={summary} previousSummary={previousSummary} analytics={viewAnalytics} previousAnalytics={previousAnalytics} reports={periodReports} pendingAnalysis={pendingAnalysis} period={period} onPeriodChange={setPeriod} onOpenSettings={()=>go("settings")} onNavigate={go} />
            </ReportSection>
            <ReportSection id="sales" title={titles.sales.title} subtitle={titles.sales.subtitle}><Sales marketplace={marketplace} summary={summary} analytics={analytics} /></ReportSection>
            <ReportSection id="products" title={titles.products.title} subtitle={titles.products.subtitle}><Products marketplace={marketplace} analytics={viewAnalytics} onAddProduct={addManualProduct} /></ReportSection>
            <ReportSection id="ads" title={titles.ads.title} subtitle={titles.ads.subtitle}><Ads marketplace={marketplace} analytics={analytics} /></ReportSection>
            <ReportSection id="stocks" title={titles.stocks.title} subtitle={titles.stocks.subtitle}><Stocks marketplace={marketplace} analytics={viewAnalytics} /></ReportSection>
            <ReportSection id="finance" title={titles.finance.title} subtitle={titles.finance.subtitle}><Finance summary={summary} analytics={analytics} /></ReportSection>
            <ReportSection id="alerts" title={titles.alerts.title} subtitle={titles.alerts.subtitle}><Alerts marketplace={marketplace} analytics={viewAnalytics} /></ReportSection>
            <ReportSection id="settings" title={titles.settings.title} subtitle={titles.settings.subtitle}><ImportCenter key={marketplace} marketplace={marketplace} reports={marketReports} importing={importing} onFiles={handleFiles} onRemove={(id)=>setReports((current)=>current.filter((report)=>report.id !== id))} onPeriodChange={(id, periodKey)=>setReports((current)=>current.map((report)=>report.id === id ? { ...report, periodKey } : report))} /></ReportSection>
          </div>
        </main>
        <nav className="mobile-nav" aria-label="Быстрая навигация по листу">{sections.slice(0,5).map(item=><a key={item.id} href={`#section-${item.id}`} className={activeSection===item.id?"active":""} onClick={(event)=>{ event.preventDefault(); go(item.id); }}><span>{item.icon}</span>{item.label}</a>)}<button type="button" onClick={()=>setMenuOpen(true)}><span>•••</span>Ещё</button></nav>
        <button className="scroll-top-button" onClick={()=>window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Вернуться в начало страницы" title="Наверх">↑</button>
      </div>
    </div>
  );
}

