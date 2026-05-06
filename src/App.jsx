import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  Megaphone,
  Package,
  RefreshCw,
  Search,
  Truck,
  Warehouse,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Boxes,
  Clock3,
  ShieldMinus,
  BadgeDollarSign,
  Ban,
  TrendingUp,
  TrendingDown,
  LineChart as LineChartIcon,
  Download,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

const SHEET_ID = "12kJ1-LrlSc7SZuF38RBRUHbXIwRICe32rJxdQS1eiZs";
const LOGO_URL = "/logo.png";

const TAB_NAMES = {
  spCampaigns: "Sponsored Products Campaigns",
  spProducts: "Products_Ad_Report",
  sbCampaigns: "Sponsored Brands Campaigns",
  sdCampaigns: "Sponsored Display Campaigns",
  spSearchTerms: "SP Search Term Report",
  sbSearchTerms: "SB Search Term Report",
  itemRef: "item_data_reference",
  inventoryFba: "inventory_fba",
  inventoryAwd: "inventory_awd",
  products30d: "products_30d",
  salesMonthly: "sales_monthly",
  fbmOnly: "FBM_only",
  // Campaign performance reports — same schema as the 30-day defaults above,
  // exported from bulk operations for additional lookback windows.
  spCampaigns7: "Sponsored Products Campaigns_7",
  sbCampaigns7: "Sponsored Brands Campaigns_7",
  sdCampaigns7: "Sponsored Display Campaigns_7",
  spCampaigns60: "Sponsored Products Campaigns_60",
  sbCampaigns60: "Sponsored Brands Campaigns_60",
  sdCampaigns60: "Sponsored Display Campaigns_60",
};

const DAYS_TO_SHIP_TARGET = 60;
const DAYS_URGENT = 14;
const NEGATIVE_CLICK_THRESHOLD = 12;

// Campaign Trends thresholds (used by the Recommended Actions categorizer)
const CAMPAIGN_TARGET_ROAS = 3.0;       // Healthy ROAS floor
const CAMPAIGN_HIDDEN_GEM_ROAS = 4.0;   // ROAS bar to call something a hidden gem
const CAMPAIGN_BLEEDING_SPEND = 50;     // Minimum 30d spend to flag as bleeding when zero orders
const CAMPAIGN_MIN_TREND_SPEND = 5;     // Minimum spend per window before we trust a trend signal

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function getSheetUrl(tabName, query = "select *") {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(
    tabName
  )}&headers=1&tq=${encodeURIComponent(query)}`;
}

function parseGviz(text) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = JSON.parse(text.slice(start + 1, end));
  const cols = json.table.cols.map((c, i) => c.label || c.id || `col_${i}`);
  return json.table.rows.map((row) => {
    const out = {};
    cols.forEach((col, i) => {
      out[col] = row.c?.[i]?.v ?? null;
    });
    return out;
  });
}

async function fetchSheet(tabName) {
  const res = await fetch(getSheetUrl(tabName));
  if (!res.ok) throw new Error(`Failed to load sheet tab: ${tabName}`);
  const text = await res.text();
  return parseGviz(text);
}

function pick(obj, keys, fallback = null) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return fallback;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[$,%\s,]/g, "")) || 0;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function exportRowsToCsv(filename, rows, columns) {
  if (typeof window === "undefined") return;
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = columns.map((c) => csvEscape(c.label)).join(",");
  const body = safeRows
    .map((row) =>
      columns
        .map((col) => {
          const raw = col.accessor ? col.accessor(row) : row[col.key];
          return csvEscape(raw);
        })
        .join(",")
    )
    .join("\n");
  const csv = `${headers}\n${body}`;
  // Prepend BOM so Excel renders UTF-8 correctly.
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ExportButton({ filename, rows, columns, label = "Export" }) {
  const disabled = !rows || rows.length === 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => exportRowsToCsv(filename, rows, columns)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
        disabled
          ? "cursor-not-allowed border-slate-800 bg-slate-900 text-slate-500"
          : "border-slate-700 bg-slate-900 text-slate-200 hover:border-rose-400 hover:text-rose-300"
      )}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function numberFmt(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function compactNumber(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function daysLabel(days) {
  if (!Number.isFinite(days)) return "—";
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  if (days >= 30) return `${(days / 30).toFixed(1)}mo`;
  return `${Math.round(days)}d`;
}

function extractAsin(text) {
  const normalized = normalizeText(text).toUpperCase();
  const match = normalized.match(/([A-Z0-9]{10})/);
  return match ? match[1] : "";
}

function extractAsins(text) {
  const normalized = normalizeText(text).toUpperCase();
  const matches = normalized.match(/[A-Z0-9]{10}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function inferImageUrl(row) {
  const explicit = normalizeText(
    pick(row, ["image url", "Image URL", "image_url", "Image Url"], "")
  );
  if (explicit) return explicit;
  const asin = normalizeText(pick(row, ["asin", "ASIN"], ""));
  return asin
    ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL120_.jpg`
    : "";
}

function AsinImage({ src, title }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        N/A
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title || "Product"}
      className="h-10 w-10 shrink-0 rounded-2xl border border-slate-800 bg-white object-contain p-1"
      onError={() => setErrored(true)}
      loading="lazy"
    />
  );
}

function sortRows(rows, sortConfig) {
  if (!sortConfig?.key) return rows;
  const { key, direction, type = "text", accessor } = sortConfig;
  const dir = direction === "desc" ? -1 : 1;

  return [...rows].sort((a, b) => {
    const av = accessor ? accessor(a) : a[key];
    const bv = accessor ? accessor(b) : b[key];

    if (type === "number") {
      return (normalizeNumber(av) - normalizeNumber(bv)) * dir;
    }

    return (
      String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * dir
    );
  });
}

function SortableHeader({ column, sortConfig, onSort }) {
  const active = sortConfig?.key === column.key;
  const icon = !active ? (
    <ChevronsUpDown className="h-3.5 w-3.5" />
  ) : sortConfig.direction === "asc" ? (
    <ChevronUp className="h-3.5 w-3.5" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5" />
  );

  if (column.sortable === false) return <span>{column.label}</span>;

  return (
    <button
      onClick={() => onSort(column)}
      className={cn(
        "inline-flex items-center gap-1 transition",
        active ? "text-rose-300" : "text-slate-300 hover:text-white"
      )}
    >
      <span>{column.label}</span>
      {icon}
    </button>
  );
}

function SortableTable({ columns, rows, rowKey, sortConfig, onSort }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-medium whitespace-nowrap">
                <SortableHeader column={col} sortConfig={sortConfig} onSort={onSort} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={typeof rowKey === "function" ? rowKey(row, idx) : row[rowKey] || idx}
              className="border-b border-slate-900 text-slate-200"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-4 align-middle">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useSortableRows(rows, defaultConfig) {
  const [sortConfig, setSortConfig] = useState(defaultConfig || null);
  const sortedRows = useMemo(() => sortRows(rows, sortConfig), [rows, sortConfig]);

  function handleSort(column) {
    const type = column.type || "text";
    const accessor = column.sortAccessor;
    setSortConfig((current) => {
      if (current?.key === column.key) {
        return {
          key: column.key,
          type,
          accessor,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key: column.key,
        type,
        accessor,
        direction: type === "text" ? "asc" : "desc",
      };
    });
  }

  return { sortedRows, sortConfig, handleSort };
}

function SidebarButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
        active
          ? "bg-slate-800 text-white shadow-lg shadow-rose-500/10"
          : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function StatCard({ label, value, suffix, icon: Icon, tone = "sky" }) {
  const formatted =
    suffix === "%"
      ? pct(value)
      : suffix === "x"
      ? `${Number(value || 0).toFixed(2)}x`
      : suffix === "count"
      ? numberFmt(value)
      : currency(value);

  const toneMap = {
    sky: "text-sky-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    rose: "text-rose-300",
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl shadow-black/20">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatted}</p>
        </div>
        <div className={cn("rounded-2xl border border-slate-800 bg-slate-900 p-3", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ComparisonCard({ title, value, positive, subtitle }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
          <p
            className={cn(
              "mt-2 text-3xl font-semibold",
              positive === null ? "text-white" : positive ? "text-emerald-300" : "text-rose-300"
            )}
          >
            {value}
          </p>
          {subtitle ? <p className="mt-2 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        <div
          className={cn(
            "rounded-2xl border border-slate-800 bg-slate-900 p-3",
            positive === null ? "text-slate-300" : positive ? "text-emerald-300" : "text-rose-300"
          )}
        >
          {positive === null ? (
            <LineChartIcon className="h-5 w-5" />
          ) : positive ? (
            <TrendingUp className="h-5 w-5" />
          ) : (
            <TrendingDown className="h-5 w-5" />
          )}
        </div>
      </div>
    </div>
  );
}

function CountCard({ label, value, suffix = "count", icon: Icon, tone = "sky" }) {
  return <StatCard label={label} value={value} suffix={suffix} icon={Icon} tone={tone} />;
}

function SectionCard({ title, subtitle, children, right }) {
  return (
    <div className="min-w-0 rounded-3xl border border-slate-800 bg-slate-950 p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TogglePills({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs transition",
            value === option
              ? "border-rose-400 bg-rose-400/10 text-rose-300"
              : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function urgencyPill(days) {
  if (!Number.isFinite(days)) {
    return (
      <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
        No sales
      </span>
    );
  }
  if (days < DAYS_URGENT) {
    return (
      <span className="rounded-full border border-rose-900 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300">
        Urgent
      </span>
    );
  }
  if (days < DAYS_TO_SHIP_TARGET) {
    return (
      <span className="rounded-full border border-amber-900 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
        Replenish
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-900 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
      Healthy
    </span>
  );
}

function recommendationPill(row) {
  if (row.alreadyBlocked) {
    return (
      <span className="rounded-full border border-rose-900 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300">
        Already blocked elsewhere
      </span>
    );
  }
  return (
    <span className="rounded-full border border-amber-900 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
      Add negative
    </span>
  );
}

function parseInventoryRows(rows, referenceByAsin, channel) {
  return rows
    .map((row) => {
      const asin = normalizeText(
        pick(row, ["asin", "ASIN", "fnsku", "FNSKU", "msku", "MSKU"], "")
      ).toUpperCase();

      const ref = referenceByAsin.get(asin) || {};

      let units = 0;
      if (channel === "fba") {
        units = normalizeNumber(pick(row, ["afn-total-quantity", "AFN Total Quantity"], 0));
      } else if (channel === "awd") {
        const available = normalizeNumber(
          pick(row, ["Available in AWD (units)", "available in awd (units)"], 0)
        );
        const inbound = normalizeNumber(
          pick(row, ["Inbound to AWD (units)", "inbound to awd (units)"], 0)
        );
        units = available + inbound;
      }

      return {
        asin,
        shortTitle:
          ref.shortTitle ||
          asin ||
          normalizeText(pick(row, ["product-name", "Product Name", "title", "Title"], "Unknown")),
        brand: ref.brand || "",
        parentAsin: ref.parentAsin || "",
        itemType: ref.type || "",
        imageUrl:
          ref.imageUrl ||
          (asin ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL120_.jpg` : ""),
        units,
      };
    })
    .filter((row) => row.asin || row.units > 0);
}

function percentChange(current, prior) {
  const c = normalizeNumber(current);
  const p = normalizeNumber(prior);
  if (p === 0) return null;
  return ((c - p) / p) * 100;
}

function monthLabel(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return normalizeText(dateValue);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Parse a bulk-operations campaign sheet (any window) into a normalized list of
// campaign rows. Mirrors the logic that was previously inlined per ad-type so we
// can reuse it across the 7/30/60 day windows.
function parseCampaignBulkSheet(sheet, adType) {
  if (!Array.isArray(sheet)) return [];
  return sheet
    .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "campaign")
    .map((row) => {
      const spend = normalizeNumber(pick(row, ["Spend", "Spend(USD)", "Cost"]));
      const sales = normalizeNumber(
        pick(row, [
          "Sales",
          "Sales(USD)",
          "Attributed Sales",
          "Sales 7 Day Total Sales",
          "14 Day Total Sales",
          "Sales 14 Day Total Sales",
        ])
      );
      const clicks = normalizeNumber(pick(row, ["Clicks"]));
      const impressions = normalizeNumber(pick(row, ["Impressions"]));
      const orders = normalizeNumber(pick(row, ["Orders", "Orders (#)"]));
      return {
        adType,
        campaignName: normalizeText(pick(row, ["Campaign Name", "Campaign"])),
        state: normalizeText(pick(row, ["State", "Status"], "—")),
        impressions,
        clicks,
        spend,
        sales,
        orders,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        acos: sales ? (spend / sales) * 100 : 0,
        roas: spend ? sales / spend : 0,
      };
    });
}

// Decide a recommended-action category for a campaign based on its trend across
// the 7/30/60 day windows. Returns one of:
//   'improving'  — ROAS rising across windows, latest above target
//   'declining'  — ROAS falling across windows, latest below target
//   'bleeding'   — meaningful 30d spend with zero orders
//   'hidden_gem' — high ROAS across windows but small spend (room to scale)
//   'monitor'    — fallback / no clear signal
function categorizeCampaign(trend) {
  const w7 = trend.windows["7"];
  const w30 = trend.windows["30"];
  const w60 = trend.windows["60"];

  // Need at least the 30-day window with some activity to do anything useful.
  if (!w30 || (w30.spend === 0 && w30.impressions === 0)) return "monitor";

  // Bleeding: real spend in 30d but no orders attributed.
  if (w30.spend >= CAMPAIGN_BLEEDING_SPEND && w30.orders === 0) {
    return "bleeding";
  }

  // Trend signals require all three windows with non-trivial spend so we don't
  // chase noise from a campaign that just launched or barely ran.
  const haveAll =
    w7 && w60 &&
    w7.spend >= CAMPAIGN_MIN_TREND_SPEND &&
    w30.spend >= CAMPAIGN_MIN_TREND_SPEND &&
    w60.spend >= CAMPAIGN_MIN_TREND_SPEND;

  if (haveAll) {
    if (w7.roas > w30.roas && w30.roas > w60.roas && w7.roas >= CAMPAIGN_TARGET_ROAS) {
      return "improving";
    }
    if (w7.roas < w30.roas && w30.roas < w60.roas && w7.roas < CAMPAIGN_TARGET_ROAS) {
      return "declining";
    }
  }

  // Hidden gem: consistently high ROAS but small spend footprint — likely capped.
  if (w30.roas >= CAMPAIGN_HIDDEN_GEM_ROAS && w30.spend < 200) {
    const supporting =
      (w60 && w60.spend >= CAMPAIGN_MIN_TREND_SPEND && w60.roas >= CAMPAIGN_TARGET_ROAS) ||
      (w7 && w7.spend >= CAMPAIGN_MIN_TREND_SPEND && w7.roas >= CAMPAIGN_TARGET_ROAS);
    if (supporting) return "hidden_gem";
  }

  return "monitor";
}

const CAMPAIGN_CATEGORIES = [
  { id: "all", label: "All Campaigns", tone: "slate", action: "" },
  { id: "improving", label: "Improving", tone: "emerald", action: "Raise bids 10–20%" },
  { id: "declining", label: "Declining", tone: "rose", action: "Lower bids 10–20%" },
  { id: "bleeding", label: "Bleeding", tone: "amber", action: "Pause or add negatives" },
  { id: "hidden_gem", label: "Hidden Gem", tone: "sky", action: "Raise daily budget" },
  { id: "monitor", label: "Monitor", tone: "slate", action: "No action — keep watching" },
];

const CATEGORY_TONE_CLASSES = {
  slate: "border-slate-700 bg-slate-900 text-slate-300",
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

function CategoryPill({ categoryId }) {
  const cat = CAMPAIGN_CATEGORIES.find((c) => c.id === categoryId) || CAMPAIGN_CATEGORIES[5];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        CATEGORY_TONE_CLASSES[cat.tone] || CATEGORY_TONE_CLASSES.slate
      )}
    >
      {cat.label}
    </span>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [adView, setAdView] = useState("Campaign");
  const [adType, setAdType] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [itemTypeFilter, setItemTypeFilter] = useState("All");
  const [parentFilter, setParentFilter] = useState("All");
  const [inventoryFilter, setInventoryFilter] = useState("All");
  const [searchView, setSearchView] = useState("Recommended");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [spCampaignSheet, setSpCampaignSheet] = useState([]);
  const [spProductSheet, setSpProductSheet] = useState([]);
  const [sbCampaignSheet, setSbCampaignSheet] = useState([]);
  const [sdCampaignSheet, setSdCampaignSheet] = useState([]);
  const [spSearchTermsSheet, setSpSearchTermsSheet] = useState([]);
  const [sbSearchTermsSheet, setSbSearchTermsSheet] = useState([]);
  const [referenceSheet, setReferenceSheet] = useState([]);
  const [inventoryFbaSheet, setInventoryFbaSheet] = useState([]);
  const [inventoryAwdSheet, setInventoryAwdSheet] = useState([]);
  const [products30dSheet, setProducts30dSheet] = useState([]);
  const [salesMonthlySheet, setSalesMonthlySheet] = useState([]);

  // Source of truth for FBM-only ASINs: the "FBM_only" Google Sheet tab.
  // Any ASIN listed there is excluded from replenishment/urgent suggestions.
  const [fbmOnlySheet, setFbmOnlySheet] = useState([]);

  // Campaign reports for additional lookback windows (7-day and 60-day).
  // The 30-day data already lives in the existing spCampaignSheet/sb/sd state.
  const [spCampaignSheet7, setSpCampaignSheet7] = useState([]);
  const [sbCampaignSheet7, setSbCampaignSheet7] = useState([]);
  const [sdCampaignSheet7, setSdCampaignSheet7] = useState([]);
  const [spCampaignSheet60, setSpCampaignSheet60] = useState([]);
  const [sbCampaignSheet60, setSbCampaignSheet60] = useState([]);
  const [sdCampaignSheet60, setSdCampaignSheet60] = useState([]);

  // Campaign Trends page UI state
  const [campaignWindow, setCampaignWindow] = useState("30"); // "7" | "30" | "60"
  const [campaignActionFilter, setCampaignActionFilter] = useState("all");

  const fbmOnlyAsins = useMemo(() => {
    const set = new Set();
    fbmOnlySheet.forEach((row) => {
      const asin = pick(row, ["ASIN", "asin", "Asin"], "");
      const trimmed = String(asin || "").trim().toUpperCase();
      if (trimmed) set.add(trimmed);
    });
    return set;
  }, [fbmOnlySheet]);

  const isFbmOnly = (asin) =>
    fbmOnlyAsins.has(String(asin || "").trim().toUpperCase());

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [
          spCampaigns,
          spProducts,
          sbCampaigns,
          sdCampaigns,
          spSearchTerms,
          sbSearchTerms,
          reference,
          fba,
          awd,
          products30d,
          salesMonthly,
          fbmOnly,
          spCamp7,
          sbCamp7,
          sdCamp7,
          spCamp60,
          sbCamp60,
          sdCamp60,
        ] = await Promise.all([
          fetchSheet(TAB_NAMES.spCampaigns),
          fetchSheet(TAB_NAMES.spProducts),
          fetchSheet(TAB_NAMES.sbCampaigns),
          fetchSheet(TAB_NAMES.sdCampaigns),
          fetchSheet(TAB_NAMES.spSearchTerms),
          fetchSheet(TAB_NAMES.sbSearchTerms),
          fetchSheet(TAB_NAMES.itemRef),
          fetchSheet(TAB_NAMES.inventoryFba),
          fetchSheet(TAB_NAMES.inventoryAwd),
          fetchSheet(TAB_NAMES.products30d),
          fetchSheet(TAB_NAMES.salesMonthly),
          // FBM_only is optional — fall back to empty if missing/unreachable so
          // the rest of the dashboard still loads.
          fetchSheet(TAB_NAMES.fbmOnly).catch(() => []),
          // 7-day and 60-day campaign reports are optional. If a tab is missing
          // the Campaign Trends page just shows empty windows — the rest of the
          // dashboard keeps working off the 30-day defaults.
          fetchSheet(TAB_NAMES.spCampaigns7).catch(() => []),
          fetchSheet(TAB_NAMES.sbCampaigns7).catch(() => []),
          fetchSheet(TAB_NAMES.sdCampaigns7).catch(() => []),
          fetchSheet(TAB_NAMES.spCampaigns60).catch(() => []),
          fetchSheet(TAB_NAMES.sbCampaigns60).catch(() => []),
          fetchSheet(TAB_NAMES.sdCampaigns60).catch(() => []),
        ]);

        setSpCampaignSheet(spCampaigns);
        setSpProductSheet(spProducts);
        setSbCampaignSheet(sbCampaigns);
        setSdCampaignSheet(sdCampaigns);
        setSpSearchTermsSheet(spSearchTerms);
        setSbSearchTermsSheet(sbSearchTerms);
        setReferenceSheet(reference);
        setInventoryFbaSheet(fba);
        setInventoryAwdSheet(awd);
        setProducts30dSheet(products30d);
        setSalesMonthlySheet(salesMonthly);
        setFbmOnlySheet(fbmOnly);
        setSpCampaignSheet7(spCamp7);
        setSbCampaignSheet7(sbCamp7);
        setSdCampaignSheet7(sdCamp7);
        setSpCampaignSheet60(spCamp60);
        setSbCampaignSheet60(sbCamp60);
        setSdCampaignSheet60(sdCamp60);
        setError("");
      } catch {
        setError(
          "Could not load Google Sheets data. Make sure the sheet is shared to 'Anyone with the link can view' and the tab names match exactly."
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const referenceByAsin = useMemo(() => {
    const map = new Map();
    referenceSheet.forEach((row) => {
      const asin = normalizeText(pick(row, ["asin", "ASIN"])).toUpperCase();
      if (!asin) return;
      map.set(asin, {
        asin,
        parentAsin: normalizeText(pick(row, ["parent asin", "Parent ASIN"], "")),
        shortTitle: normalizeText(pick(row, ["short title", "Short Title"], "")),
        brand: normalizeText(pick(row, ["brand", "Brand"], "")),
        type: normalizeText(pick(row, ["type", "Type", "item type", "Item Type"], "")),
        imageUrl: inferImageUrl(row),
      });
    });
    return map;
  }, [referenceSheet]);

  const adTypeOptions = ["All", "Sponsored Products", "Sponsored Brands", "Sponsored Display"];

  const unifiedCampaignRows = useMemo(() => {
    const sp = spCampaignSheet
      .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "campaign")
      .map((row) => {
        const spend = normalizeNumber(pick(row, ["Spend", "Spend(USD)", "Cost"]));
        const sales = normalizeNumber(
          pick(row, ["Sales", "Sales(USD)", "Attributed Sales", "Sales 7 Day Total Sales"])
        );
        const clicks = normalizeNumber(pick(row, ["Clicks"]));
        const impressions = normalizeNumber(pick(row, ["Impressions"]));
        const orders = normalizeNumber(pick(row, ["Orders"]));
        return {
          adType: "Sponsored Products",
          campaignName: normalizeText(pick(row, ["Campaign Name", "Campaign"])),
          state: normalizeText(pick(row, ["State", "Status"], "—")),
          campaignType: normalizeText(pick(row, ["Campaign Type", "Ad Type"], "SP")),
          impressions,
          clicks,
          spend,
          sales,
          orders,
          ctr: impressions ? (clicks / impressions) * 100 : 0,
          acos: sales ? (spend / sales) * 100 : 0,
          roas: spend ? sales / spend : 0,
        };
      });

    const sb = sbCampaignSheet
      .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "campaign")
      .map((row) => {
        const spend = normalizeNumber(pick(row, ["Spend", "Spend(USD)", "Cost"]));
        const sales = normalizeNumber(
          pick(row, ["Sales", "Sales(USD)", "Attributed Sales", "14 Day Total Sales"])
        );
        const clicks = normalizeNumber(pick(row, ["Clicks"]));
        const impressions = normalizeNumber(pick(row, ["Impressions"]));
        const orders = normalizeNumber(pick(row, ["Orders", "Orders (#)"]));
        return {
          adType: "Sponsored Brands",
          campaignName: normalizeText(pick(row, ["Campaign Name", "Campaign"])),
          state: normalizeText(pick(row, ["State", "Status"], "—")),
          campaignType: "SB",
          impressions,
          clicks,
          spend,
          sales,
          orders,
          ctr: impressions ? (clicks / impressions) * 100 : 0,
          acos: sales ? (spend / sales) * 100 : 0,
          roas: spend ? sales / spend : 0,
        };
      });

    const sd = sdCampaignSheet
      .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "campaign")
      .map((row) => {
        const spend = normalizeNumber(pick(row, ["Spend", "Spend(USD)", "Cost"]));
        const sales = normalizeNumber(
          pick(row, ["Sales", "Sales(USD)", "Attributed Sales", "Sales 14 Day Total Sales"])
        );
        const clicks = normalizeNumber(pick(row, ["Clicks"]));
        const impressions = normalizeNumber(pick(row, ["Impressions"]));
        const orders = normalizeNumber(pick(row, ["Orders"]));
        return {
          adType: "Sponsored Display",
          campaignName: normalizeText(pick(row, ["Campaign Name", "Campaign"])),
          state: normalizeText(pick(row, ["State", "Status"], "—")),
          campaignType: "SD",
          impressions,
          clicks,
          spend,
          sales,
          orders,
          ctr: impressions ? (clicks / impressions) * 100 : 0,
          acos: sales ? (spend / sales) * 100 : 0,
          roas: spend ? sales / spend : 0,
        };
      });

    return [...sp, ...sb, ...sd]
      .filter((row) => adType === "All" || row.adType === adType)
      .filter(
        (row) =>
          !query ||
          `${row.campaignName} ${row.state} ${row.campaignType} ${row.adType}`
            .toLowerCase()
            .includes(query.toLowerCase())
      );
  }, [spCampaignSheet, sbCampaignSheet, sdCampaignSheet, adType, query]);

  // ---------- Campaign Trends data plumbing ----------
  // Parse each window into a flat list of campaign rows (no UI filters applied).
  const campaignsByWindow = useMemo(() => {
    return {
      "7": [
        ...parseCampaignBulkSheet(spCampaignSheet7, "Sponsored Products"),
        ...parseCampaignBulkSheet(sbCampaignSheet7, "Sponsored Brands"),
        ...parseCampaignBulkSheet(sdCampaignSheet7, "Sponsored Display"),
      ],
      "30": [
        ...parseCampaignBulkSheet(spCampaignSheet, "Sponsored Products"),
        ...parseCampaignBulkSheet(sbCampaignSheet, "Sponsored Brands"),
        ...parseCampaignBulkSheet(sdCampaignSheet, "Sponsored Display"),
      ],
      "60": [
        ...parseCampaignBulkSheet(spCampaignSheet60, "Sponsored Products"),
        ...parseCampaignBulkSheet(sbCampaignSheet60, "Sponsored Brands"),
        ...parseCampaignBulkSheet(sdCampaignSheet60, "Sponsored Display"),
      ],
    };
  }, [
    spCampaignSheet, sbCampaignSheet, sdCampaignSheet,
    spCampaignSheet7, sbCampaignSheet7, sdCampaignSheet7,
    spCampaignSheet60, sbCampaignSheet60, sdCampaignSheet60,
  ]);

  // Stitch each campaign's rows across windows into a single trend object.
  const campaignTrends = useMemo(() => {
    const map = new Map();
    for (const w of ["7", "30", "60"]) {
      for (const r of campaignsByWindow[w]) {
        if (!r.campaignName) continue;
        const key = `${r.adType}||${r.campaignName}`;
        const existing = map.get(key) || {
          adType: r.adType,
          campaignName: r.campaignName,
          state: r.state,
          windows: {},
        };
        existing.windows[w] = r;
        // Prefer the most recent (smallest window) state if present.
        if (w === "7" && r.state) existing.state = r.state;
        else if (!existing.state && r.state) existing.state = r.state;
        map.set(key, existing);
      }
    }
    return [...map.values()].map((trend) => ({
      ...trend,
      category: categorizeCampaign(trend),
    }));
  }, [campaignsByWindow]);

  // Counts per recommended-action category, used by the cards at the top.
  const campaignCategoryCounts = useMemo(() => {
    const counts = { all: campaignTrends.length };
    for (const c of CAMPAIGN_CATEGORIES) {
      if (c.id === "all") continue;
      counts[c.id] = 0;
    }
    for (const t of campaignTrends) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    return counts;
  }, [campaignTrends]);

  // The flat list driving the Campaign Trends table — applies the window/filters
  // so we surface metrics for the chosen window at the top level of each row.
  const campaignTrendRows = useMemo(() => {
    const w = campaignWindow;
    return campaignTrends
      .filter(
        (t) =>
          campaignActionFilter === "all" || t.category === campaignActionFilter
      )
      .filter((t) => adType === "All" || t.adType === adType)
      .filter(
        (t) =>
          itemTypeFilter === "All" ||
          (t.campaignName || "")
            .toLowerCase()
            .includes(itemTypeFilter.toLowerCase())
      )
      .filter(
        (t) =>
          !query ||
          `${t.campaignName} ${t.state} ${t.adType}`
            .toLowerCase()
            .includes(query.toLowerCase())
      )
      .map((t) => {
        const cur = t.windows[w] || {};
        return {
          ...t,
          spend: cur.spend ?? 0,
          sales: cur.sales ?? 0,
          clicks: cur.clicks ?? 0,
          impressions: cur.impressions ?? 0,
          orders: cur.orders ?? 0,
          ctr: cur.ctr ?? 0,
          acos: cur.acos ?? 0,
          roas: cur.roas ?? 0,
          roas7: t.windows["7"]?.roas ?? null,
          roas30: t.windows["30"]?.roas ?? null,
          roas60: t.windows["60"]?.roas ?? null,
          recommendedAction:
            (CAMPAIGN_CATEGORIES.find((c) => c.id === t.category) || {}).action || "",
        };
      });
  }, [campaignTrends, campaignWindow, campaignActionFilter, adType, itemTypeFilter, query]);

  const spProductRows = useMemo(() => {
    return spProductSheet
      .map((row) => {
        const asin = extractAsin(pick(row, ["Products", "Product", "products"], ""));
        const ref = referenceByAsin.get(asin) || {};
        const spend = normalizeNumber(pick(row, ["Spend(USD)", "Spend", "Cost"]));
        const sales = normalizeNumber(pick(row, ["Sales(USD)", "Sales", "Attributed Sales"]));
        const clicks = normalizeNumber(pick(row, ["Clicks"]));
        const impressions = normalizeNumber(pick(row, ["Impressions"]));
        const orders = normalizeNumber(pick(row, ["Orders"]));
        return {
          adType: "Sponsored Products",
          asin,
          parentAsin: ref.parentAsin || "",
          itemType: ref.type || "",
          brand: ref.brand || "",
          shortTitle: ref.shortTitle || asin,
          imageUrl:
            ref.imageUrl ||
            (asin ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL120_.jpg` : ""),
          impressions,
          clicks,
          spend,
          sales,
          orders,
          ctr: impressions ? (clicks / impressions) * 100 : 0,
          cvr: clicks ? (orders / clicks) * 100 : 0,
          acos: sales ? (spend / sales) * 100 : 0,
          roas: spend ? sales / spend : 0,
        };
      })
      .filter((row) => row.asin);
  }, [spProductSheet, referenceByAsin]);

  const sbProductRows = useMemo(() => {
    const rows = [];
    sbCampaignSheet
      .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "campaign")
      .forEach((row) => {
        const spend = normalizeNumber(pick(row, ["Spend", "Spend(USD)", "Cost"]));
        const sales = normalizeNumber(
          pick(row, ["Sales", "Sales(USD)", "Attributed Sales", "14 Day Total Sales"])
        );
        const clicks = normalizeNumber(pick(row, ["Clicks"]));
        const impressions = normalizeNumber(pick(row, ["Impressions"]));
        const orders = normalizeNumber(pick(row, ["Orders", "Orders (#)"]));
        const asins = [
          ...extractAsins(pick(row, ["Creative ASINs"], "")),
          ...extractAsins(pick(row, ["Landing Page URL"], "")),
        ];
        const uniqueAsins = Array.from(new Set(asins)).filter(Boolean);
        if (!uniqueAsins.length) return;
        const divisor = uniqueAsins.length;
        uniqueAsins.forEach((asin) => {
          const ref = referenceByAsin.get(asin) || {};
          rows.push({
            adType: "Sponsored Brands",
            asin,
            parentAsin: ref.parentAsin || "",
            itemType: ref.type || "",
            brand: ref.brand || "",
            shortTitle: ref.shortTitle || asin,
            imageUrl:
              ref.imageUrl ||
              `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL120_.jpg`,
            impressions: impressions / divisor,
            clicks: clicks / divisor,
            spend: spend / divisor,
            sales: sales / divisor,
            orders: orders / divisor,
            ctr: impressions ? (clicks / impressions) * 100 : 0,
            cvr: clicks ? (orders / clicks) * 100 : 0,
            acos: sales ? (spend / sales) * 100 : 0,
            roas: spend ? sales / spend : 0,
          });
        });
      });
    return rows;
  }, [sbCampaignSheet, referenceByAsin]);

  const sdProductRows = useMemo(() => {
    return sdCampaignSheet
      .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "campaign")
      .map((row) => {
        const asin = extractAsin(
          pick(row, ["Promoted ASIN", "ASIN", "Advertised ASIN", "Product"], "")
        );
        const ref = referenceByAsin.get(asin) || {};
        const spend = normalizeNumber(pick(row, ["Spend", "Spend(USD)", "Cost"]));
        const sales = normalizeNumber(
          pick(row, ["Sales", "Sales(USD)", "Attributed Sales", "Sales 14 Day Total Sales"])
        );
        const clicks = normalizeNumber(pick(row, ["Clicks"]));
        const impressions = normalizeNumber(pick(row, ["Impressions"]));
        const orders = normalizeNumber(pick(row, ["Orders"]));
        return {
          adType: "Sponsored Display",
          asin,
          parentAsin: ref.parentAsin || "",
          itemType: ref.type || "",
          brand: ref.brand || "",
          shortTitle:
            ref.shortTitle ||
            asin ||
            normalizeText(pick(row, ["Campaign Name"], "Display Campaign")),
          imageUrl:
            ref.imageUrl ||
            (asin ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL120_.jpg` : ""),
          impressions,
          clicks,
          spend,
          sales,
          orders,
          ctr: impressions ? (clicks / impressions) * 100 : 0,
          cvr: clicks ? (orders / clicks) * 100 : 0,
          acos: sales ? (spend / sales) * 100 : 0,
          roas: spend ? sales / spend : 0,
        };
      })
      .filter((row) => row.asin);
  }, [sdCampaignSheet, referenceByAsin]);

  const unifiedProductRows = useMemo(() => {
    return [...spProductRows, ...sbProductRows, ...sdProductRows]
      .filter((row) => adType === "All" || row.adType === adType)
      .filter((row) => brandFilter === "All" || row.brand === brandFilter)
      .filter((row) => itemTypeFilter === "All" || row.itemType === itemTypeFilter)
      .filter((row) => parentFilter === "All" || row.parentAsin === parentFilter)
      .filter(
        (row) =>
          !query ||
          `${row.asin} ${row.parentAsin} ${row.shortTitle} ${row.brand} ${row.itemType} ${row.adType}`
            .toLowerCase()
            .includes(query.toLowerCase())
      );
  }, [spProductRows, sbProductRows, sdProductRows, adType, brandFilter, itemTypeFilter, parentFilter, query]);

  const brandOptions = useMemo(
    () => ["All", ...Array.from(new Set(unifiedProductRows.map((r) => r.brand).filter(Boolean))).sort()],
    [unifiedProductRows]
  );
  const itemTypeOptions = useMemo(
    () => ["All", ...Array.from(new Set(unifiedProductRows.map((r) => r.itemType).filter(Boolean))).sort()],
    [unifiedProductRows]
  );
  const parentOptions = useMemo(
    () => ["All", ...Array.from(new Set(unifiedProductRows.map((r) => r.parentAsin).filter(Boolean))).sort()],
    [unifiedProductRows]
  );

  const productGrouped = useMemo(() => {
    const map = new Map();
    unifiedProductRows.forEach((row) => {
      const key = `${row.adType}||${row.asin}`;
      const current = map.get(key) || {
        ...row,
        impressions: 0,
        clicks: 0,
        spend: 0,
        sales: 0,
        orders: 0,
      };
      current.impressions += row.impressions;
      current.clicks += row.clicks;
      current.spend += row.spend;
      current.sales += row.sales;
      current.orders += row.orders;
      map.set(key, current);
    });
    return [...map.values()].map((row) => ({
      ...row,
      ctr: row.impressions ? (row.clicks / row.impressions) * 100 : 0,
      cvr: row.clicks ? (row.orders / row.clicks) * 100 : 0,
      acos: row.sales ? (row.spend / row.sales) * 100 : 0,
      roas: row.spend ? row.sales / row.spend : 0,
    }));
  }, [unifiedProductRows]);

  const competitorTargets = useMemo(() => {
    const rows = spCampaignSheet
      .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "product targeting")
      .filter((row) => {
        const expr = normalizeText(
          pick(row, [
            "Resolved Product Targeting Expression (Informational only)",
            "Product Targeting Expression",
          ], "")
        ).toLowerCase();
        return expr.includes("asin=") || expr.includes("asin-expanded=");
      });

    const map = new Map();

    rows.forEach((row) => {
      const rawExpr = normalizeText(
        pick(row, [
          "Resolved Product Targeting Expression (Informational only)",
          "Product Targeting Expression",
        ], "")
      );
      const expr = rawExpr.toLowerCase();
      const asinMatch = expr.match(/asin(?:-expanded)?=\"?([a-z0-9]{10})\"?/i);
      if (!asinMatch) return;

      const targetAsin = asinMatch[1].toUpperCase();
      const ref = referenceByAsin.get(targetAsin) || {};
      const spend = normalizeNumber(pick(row, ["Spend"], 0));
      const sales = normalizeNumber(pick(row, ["Sales"], 0));
      const orders = normalizeNumber(pick(row, ["Orders"], 0));
      const clicks = normalizeNumber(pick(row, ["Clicks"], 0));
      const impressions = normalizeNumber(pick(row, ["Impressions"], 0));

      const current = map.get(targetAsin) || {
        asin: targetAsin,
        shortTitle: ref.shortTitle || targetAsin,
        brand: ref.brand || "",
        itemType: ref.type || "",
        imageUrl:
          ref.imageUrl ||
          `https://images-na.ssl-images-amazon.com/images/P/${targetAsin}.01._SL120_.jpg`,
        campaignName: normalizeText(
          pick(row, ["Campaign Name (Informational only)", "Campaign Name"], "—")
        ),
        adGroupName: normalizeText(
          pick(row, ["Ad Group Name (Informational only)", "Ad Group Name"], "—")
        ),
        state: normalizeText(pick(row, ["State"], "—")),
        impressions: 0,
        clicks: 0,
        spend: 0,
        sales: 0,
        orders: 0,
      };

      current.impressions += impressions;
      current.clicks += clicks;
      current.spend += spend;
      current.sales += sales;
      current.orders += orders;
      map.set(targetAsin, current);
    });

    return [...map.values()]
      .map((row) => ({
        ...row,
        ctr: row.impressions ? (row.clicks / row.impressions) * 100 : 0,
        acos: row.sales ? (row.spend / row.sales) * 100 : 0,
        roas: row.spend ? row.sales / row.spend : 0,
      }))
      .filter((row) =>
        !query ||
        `${row.asin} ${row.shortTitle} ${row.campaignName} ${row.adGroupName} ${row.brand} ${row.itemType}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
  }, [spCampaignSheet, referenceByAsin, query]);

  const autoCampaignTargets = useMemo(() => {
    return spCampaignSheet
      .filter((row) => normalizeText(pick(row, ["Entity", "entity"])).toLowerCase() === "campaign")
      .filter((row) => normalizeText(pick(row, ["Targeting Type"], "")).toLowerCase() === "auto")
      .map((row) => {
        const impressions = normalizeNumber(pick(row, ["Impressions"], 0));
        const clicks = normalizeNumber(pick(row, ["Clicks"], 0));
        const spend = normalizeNumber(pick(row, ["Spend"], 0));
        const sales = normalizeNumber(pick(row, ["Sales"], 0));
        const orders = normalizeNumber(pick(row, ["Orders"], 0));
        return {
          campaignName: normalizeText(pick(row, ["Campaign Name", "Campaign Name (Informational only)"], "—")),
          state: normalizeText(pick(row, ["State"], "—")),
          impressions,
          clicks,
          spend,
          sales,
          orders,
          ctr: impressions ? (clicks / impressions) * 100 : 0,
          acos: sales ? (spend / sales) * 100 : 0,
          roas: spend ? sales / spend : 0,
        };
      })
      .filter((row) =>
        !query ||
        `${row.campaignName} ${row.state}`.toLowerCase().includes(query.toLowerCase())
      )
      .sort((a, b) => b.spend - a.spend);
  }, [spCampaignSheet, query]);

  const negativeProductTargets = useMemo(() => {
    const rows = spCampaignSheet.filter((row) => {
      const entity = normalizeText(pick(row, ["Entity", "entity"])).toLowerCase();
      return entity === "negative product targeting" || entity === "campaign negative product targeting";
    });

    const map = new Map();

    rows.forEach((row) => {
      const rawExpr = normalizeText(
        pick(row, [
          "Resolved Product Targeting Expression (Informational only)",
          "Product Targeting Expression",
        ], "")
      );
      const expr = rawExpr.toLowerCase();
      const asinMatch = expr.match(/asin(?:-expanded)?=\"?([a-z0-9]{10})\"?/i);
      const targetAsin = asinMatch ? asinMatch[1].toUpperCase() : rawExpr || "Unknown";

      const ref = asinMatch ? (referenceByAsin.get(targetAsin) || {}) : {};
      const key = `${targetAsin}||${normalizeText(pick(row, ["Campaign Name (Informational only)", "Campaign Name"], "—"))}||${normalizeText(pick(row, ["Ad Group Name (Informational only)", "Ad Group Name"], "—"))}`;

      if (!map.has(key)) {
        map.set(key, {
          asin: targetAsin,
          shortTitle: ref.shortTitle || targetAsin,
          brand: ref.brand || "",
          itemType: ref.type || "",
          imageUrl:
            asinMatch
              ? (ref.imageUrl || `https://images-na.ssl-images-amazon.com/images/P/${targetAsin}.01._SL120_.jpg`)
              : "",
          campaignName: normalizeText(
            pick(row, ["Campaign Name (Informational only)", "Campaign Name"], "—")
          ),
          adGroupName: normalizeText(
            pick(row, ["Ad Group Name (Informational only)", "Ad Group Name"], "—")
          ),
          state: normalizeText(pick(row, ["State"], "—")),
          expression: rawExpr || "—",
        });
      }
    });

    return [...map.values()]
      .filter((row) =>
        !query ||
        `${row.asin} ${row.shortTitle} ${row.campaignName} ${row.adGroupName} ${row.expression}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
      .sort((a, b) => a.campaignName.localeCompare(b.campaignName));
  }, [spCampaignSheet, referenceByAsin, query]);

  const targetingInsights = useMemo(() => {
    const highSpendNoOrders = [...competitorTargets]
      .filter((row) => row.spend >= 25 && row.orders === 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    const bestRoas = [...competitorTargets]
      .filter((row) => row.orders > 0 && row.spend >= 10)
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 5);

    return { highSpendNoOrders, bestRoas };
  }, [competitorTargets]);

  const parentGrouped = useMemo(() => {
    const map = new Map();
    unifiedProductRows.forEach((row) => {
      const key = `${row.adType}||${row.parentAsin || "Unmapped"}`;
      const current = map.get(key) || {
        adType: row.adType,
        parentAsin: row.parentAsin || "Unmapped",
        imageUrl: row.imageUrl,
        impressions: 0,
        clicks: 0,
        spend: 0,
        sales: 0,
        orders: 0,
      };
      current.impressions += row.impressions;
      current.clicks += row.clicks;
      current.spend += row.spend;
      current.sales += row.sales;
      current.orders += row.orders;
      map.set(key, current);
    });
    return [...map.values()].map((row) => ({
      ...row,
      ctr: row.impressions ? (row.clicks / row.impressions) * 100 : 0,
      cvr: row.clicks ? (row.orders / row.clicks) * 100 : 0,
      acos: row.sales ? (row.spend / row.sales) * 100 : 0,
      roas: row.spend ? row.sales / row.spend : 0,
    }));
  }, [unifiedProductRows]);

  const itemTypeGrouped = useMemo(() => {
    const map = new Map();
    unifiedProductRows.forEach((row) => {
      const key = `${row.adType}||${row.itemType || "Unmapped"}`;
      const current = map.get(key) || {
        adType: row.adType,
        itemType: row.itemType || "Unmapped",
        impressions: 0,
        clicks: 0,
        spend: 0,
        sales: 0,
        orders: 0,
      };
      current.impressions += row.impressions;
      current.clicks += row.clicks;
      current.spend += row.spend;
      current.sales += row.sales;
      current.orders += row.orders;
      map.set(key, current);
    });
    return [...map.values()].map((row) => ({
      ...row,
      ctr: row.impressions ? (row.clicks / row.impressions) * 100 : 0,
      cvr: row.clicks ? (row.orders / row.clicks) * 100 : 0,
      acos: row.sales ? (row.spend / row.sales) * 100 : 0,
      roas: row.spend ? row.sales / row.spend : 0,
    }));
  }, [unifiedProductRows]);

  const adSummary = useMemo(() => {
    const spend = unifiedProductRows.reduce((sum, row) => sum + row.spend, 0);
    const sales = unifiedProductRows.reduce((sum, row) => sum + row.sales, 0);
    return { spend, sales, acos: sales ? (spend / sales) * 100 : 0, roas: spend ? sales / spend : 0 };
  }, [unifiedProductRows]);

  const salesByAsin30d = useMemo(() => {
    const map = new Map();
    products30dSheet.forEach((row) => {
      const asin = normalizeText(
        pick(row, ["(Child) ASIN", "Child ASIN", "child asin", "ASIN", "asin"], "")
      ).toUpperCase();
      if (!asin) return;
      const ref = referenceByAsin.get(asin) || {};
      const unitsOrdered = normalizeNumber(
        pick(row, ["Units Ordered", "units ordered", "Ordered Product Sales Units"], 0)
      );
      const current = map.get(asin) || {
        asin,
        shortTitle: ref.shortTitle || asin,
        brand: ref.brand || "",
        parentAsin: ref.parentAsin || "",
        itemType: ref.type || "",
        imageUrl:
          ref.imageUrl ||
          `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL120_.jpg`,
        units30d: 0,
      };
      current.units30d += unitsOrdered;
      map.set(asin, current);
    });
    return map;
  }, [products30dSheet, referenceByAsin]);
const totalSalesProducts30d = useMemo(() => {
  const map = new Map();

  products30dSheet.forEach((row) => {
    const asin = normalizeText(
      pick(row, ["(Child) ASIN", "Child ASIN", "child asin", "ASIN", "asin"], "")
    ).toUpperCase();

    if (!asin) return;

    const ref = referenceByAsin.get(asin) || {};

    const sales30d = normalizeNumber(
      pick(row, ["Ordered Product Sales", "ordered product sales", "Sales", "sales"], 0)
    );

    const units30d = normalizeNumber(
      pick(row, ["Units Ordered", "units ordered", "Units", "units"], 0)
    );

    const current = map.get(asin) || {
      asin,
      shortTitle: ref.shortTitle || asin,
      brand: ref.brand || "Unknown",
      parentAsin: ref.parentAsin || "",
      itemType: ref.type || "Unknown",
      imageUrl:
        ref.imageUrl ||
        `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL120_.jpg`,
      sales30d: 0,
      units30d: 0,
    };

    current.sales30d += sales30d;
    current.units30d += units30d;

    map.set(asin, current);
  });

  return [...map.values()];
}, [products30dSheet, referenceByAsin]);

const topProductsList = useMemo(() => {
  return [...totalSalesProducts30d]
    .sort((a, b) => b.sales30d - a.sales30d)
    .slice(0, 5);
}, [totalSalesProducts30d]);

  const monthlySales = useMemo(() => {
    const rows = salesMonthlySheet
      .map((row) => {
        const rawDate = pick(row, ["Date", "Month", "date", "month"], "");
        const sales = normalizeNumber(
          pick(row, ["Ordered Product Sales", "ordered product sales", "Sales", "sales"], 0)
        );
        const units = normalizeNumber(
          pick(row, ["Units Ordered", "units ordered", "Units", "units"], 0)
        );
        const profit = normalizeNumber(
          pick(row, ["Profit", "profit", "Net Profit", "net profit"], 0)
        );
        const parsedDate = new Date(rawDate);
        return {
          rawDate,
          parsedDate,
          label: monthLabel(rawDate),
          sales,
          units,
          profit,
          hasProfit:
            pick(row, ["Profit", "profit", "Net Profit", "net profit"], null) !== null &&
            pick(row, ["Profit", "profit", "Net Profit", "net profit"], "") !== "",
        };
      })
      .filter((row) => row.rawDate);

    rows.sort((a, b) => {
      const ad = a.parsedDate instanceof Date && !Number.isNaN(a.parsedDate) ? a.parsedDate.getTime() : 0;
      const bd = b.parsedDate instanceof Date && !Number.isNaN(b.parsedDate) ? b.parsedDate.getTime() : 0;
      return ad - bd;
    });

    return rows;
  }, [salesMonthlySheet]);

  const monthlySalesChartData = useMemo(() => {
    return monthlySales.map((row) => ({
      month: row.label,
      sales: row.sales,
      profit: row.hasProfit ? row.profit : null,
    }));
  }, [monthlySales]);

  const currentMonthRow = monthlySales[monthlySales.length - 1] || null;
  const previousMonthRow = monthlySales[monthlySales.length - 2] || null;

  const sameMonthLastYearRow = useMemo(() => {
    if (!currentMonthRow || !currentMonthRow.parsedDate || Number.isNaN(currentMonthRow.parsedDate.getTime())) {
      return null;
    }
    const currentMonth = currentMonthRow.parsedDate.getMonth();
    const currentYear = currentMonthRow.parsedDate.getFullYear();
    return (
      monthlySales.find((row) => {
        if (!row.parsedDate || Number.isNaN(row.parsedDate.getTime())) return false;
        return (
          row.parsedDate.getMonth() === currentMonth &&
          row.parsedDate.getFullYear() === currentYear - 1
        );
      }) || null
    );
  }, [monthlySales, currentMonthRow]);

  const salesVsLastMonth = percentChange(currentMonthRow?.sales, previousMonthRow?.sales);
  const salesVsLastYear = percentChange(currentMonthRow?.sales, sameMonthLastYearRow?.sales);
  const profitVsLastMonth =
    currentMonthRow?.hasProfit && previousMonthRow?.hasProfit
      ? percentChange(currentMonthRow?.profit, previousMonthRow?.profit)
      : null;
  const profitVsLastYear =
    currentMonthRow?.hasProfit && sameMonthLastYearRow?.hasProfit
      ? percentChange(currentMonthRow?.profit, sameMonthLastYearRow?.profit)
      : null;

const revenueByBrand = useMemo(() => {
  const map = new Map();
  totalSalesProducts30d.forEach((row) => {
    const key = row.brand || "Unknown";
    map.set(key, (map.get(key) || 0) + row.sales30d);
  });
  return [...map.entries()]
    .map(([brand, sales]) => ({ brand, sales }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);
}, [totalSalesProducts30d]);
  
const revenueByCategory = useMemo(() => {
  const map = new Map();
  totalSalesProducts30d.forEach((row) => {
    const key = row.itemType || "Unknown";
    map.set(key, (map.get(key) || 0) + row.sales30d);
  });
  return [...map.entries()]
    .map(([category, sales]) => ({ category, sales }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);
}, [totalSalesProducts30d]);
  
  const fbaInventoryRows = useMemo(
    () => parseInventoryRows(inventoryFbaSheet, referenceByAsin, "fba"),
    [inventoryFbaSheet, referenceByAsin]
  );

  const awdInventoryRows = useMemo(
    () => parseInventoryRows(inventoryAwdSheet, referenceByAsin, "awd"),
    [inventoryAwdSheet, referenceByAsin]
  );

  const inventoryByAsin = useMemo(() => {
    const map = new Map();
    const upsert = (rows, channel) => {
      rows.forEach((row) => {
        if (!row.asin) return;
        const current = map.get(row.asin) || {
          asin: row.asin,
          shortTitle: row.shortTitle,
          brand: row.brand,
          parentAsin: row.parentAsin,
          itemType: row.itemType,
          imageUrl: row.imageUrl,
          fbaUnits: 0,
          awdUnits: 0,
        };
        if (channel === "fba") current.fbaUnits += row.units;
        if (channel === "awd") current.awdUnits += row.units;
        map.set(row.asin, current);
      });
    };
    upsert(fbaInventoryRows, "fba");
    upsert(awdInventoryRows, "awd");

    return [...map.values()].map((row) => {
      const salesRef = salesByAsin30d.get(row.asin) || {};
      const units30d = normalizeNumber(salesRef.units30d);
      const unitsPerDay = units30d / 30;
      const totalUnits = row.fbaUnits + row.awdUnits;
      const daysOfCover = unitsPerDay > 0 ? totalUnits / unitsPerDay : Number.POSITIVE_INFINITY;
      return {
        ...row,
        units30d,
        unitsPerDay,
        totalUnits,
        daysOfCover,
        urgency: !Number.isFinite(daysOfCover)
          ? "no_sales"
          : daysOfCover < DAYS_URGENT
          ? "urgent"
          : daysOfCover < DAYS_TO_SHIP_TARGET
          ? "replenish"
          : "healthy",
      };
    });
  }, [fbaInventoryRows, awdInventoryRows, salesByAsin30d]);

  const inventoryFiltered = useMemo(() => {
    return inventoryByAsin
      .filter((row) => inventoryFilter === "All" || row.urgency === inventoryFilter)
      .filter(
        (row) =>
          !query ||
          `${row.asin} ${row.shortTitle} ${row.brand} ${row.parentAsin} ${row.itemType}`
            .toLowerCase()
            .includes(query.toLowerCase())
      );
  }, [inventoryByAsin, inventoryFilter, query]);

  const urgentInventory = useMemo(
    () =>
      inventoryByAsin
        .filter(
          (row) =>
            row.urgency === "urgent" &&
            !fbmOnlyAsins.has(String(row.asin || "").trim().toUpperCase())
        )
        .sort((a, b) => a.daysOfCover - b.daysOfCover),
    [inventoryByAsin, fbmOnlyAsins]
  );

  const replenishInventory = useMemo(
    () =>
      inventoryByAsin
        .filter(
          (row) =>
            row.urgency === "replenish" &&
            !fbmOnlyAsins.has(String(row.asin || "").trim().toUpperCase())
        )
        .sort((a, b) => a.daysOfCover - b.daysOfCover),
    [inventoryByAsin, fbmOnlyAsins]
  );

  const inventorySummary = useMemo(() => {
    const totalFba = inventoryByAsin.reduce((sum, row) => sum + row.fbaUnits, 0);
    const totalAwd = inventoryByAsin.reduce((sum, row) => sum + row.awdUnits, 0);
    const atRisk = inventoryByAsin.filter((row) => row.daysOfCover < DAYS_TO_SHIP_TARGET).length;
    const urgent = inventoryByAsin.filter((row) => row.daysOfCover < DAYS_URGENT).length;
    const totalDailySales = inventoryByAsin.reduce((sum, row) => sum + row.unitsPerDay, 0);
    const blendedDays =
      totalDailySales > 0 ? (totalFba + totalAwd) / totalDailySales : Number.POSITIVE_INFINITY;
    return { totalFba, totalAwd, atRisk, urgent, blendedDays };
  }, [inventoryByAsin]);

  const riskChartData = useMemo(() => {
    return [...inventoryByAsin]
      .filter((row) => Number.isFinite(row.daysOfCover))
      .sort((a, b) => a.daysOfCover - b.daysOfCover)
      .slice(0, 12)
      .map((row) => ({
        name: row.shortTitle.length > 18 ? `${row.shortTitle.slice(0, 18)}…` : row.shortTitle,
        days: row.daysOfCover,
      }));
  }, [inventoryByAsin]);

  // Export-only version of the lowest-cover data: excludes FBM-only ASINs and
  // uses the full untruncated title (CSV doesn't need ellipses).
  const riskChartExportRows = useMemo(() => {
    return [...inventoryByAsin]
      .filter(
        (row) =>
          Number.isFinite(row.daysOfCover) &&
          !fbmOnlyAsins.has(String(row.asin || "").trim().toUpperCase())
      )
      .sort((a, b) => a.daysOfCover - b.daysOfCover)
      .slice(0, 12)
      .map((row) => ({
        name: row.shortTitle,
        days: row.daysOfCover,
      }));
  }, [inventoryByAsin, fbmOnlyAsins]);

  const spExistingNegatives = useMemo(() => {
    return spCampaignSheet
      .filter((row) => {
        const entity = normalizeText(pick(row, ["Entity", "entity"])).toLowerCase();
        const matchType = normalizeText(pick(row, ["Match Type"])).toLowerCase();
        return entity.includes("negative") || matchType.includes("negative");
      })
      .map((row) => ({
        adType: "Sponsored Products",
        entity: normalizeText(pick(row, ["Entity"])),
        campaign: normalizeText(
          pick(row, ["Campaign Name (Informational only)", "Campaign Name"], "—")
        ),
        adGroup: normalizeText(
          pick(row, ["Ad Group Name (Informational only)", "Ad Group Name"], "—")
        ),
        term: normalizeText(pick(row, ["Keyword Text", "Product Targeting Expression"], "")),
        matchType: normalizeText(pick(row, ["Match Type"], "—")),
        state: normalizeText(pick(row, ["State"], "—")),
      }))
      .filter((row) => row.term);
  }, [spCampaignSheet]);

  const sbExistingNegatives = useMemo(() => {
    return sbCampaignSheet
      .filter((row) => {
        const entity = normalizeText(pick(row, ["Entity", "entity"])).toLowerCase();
        const matchType = normalizeText(pick(row, ["Match Type"])).toLowerCase();
        return entity.includes("negative") || matchType.includes("negative");
      })
      .map((row) => ({
        adType: "Sponsored Brands",
        entity: normalizeText(pick(row, ["Entity"])),
        campaign: normalizeText(
          pick(row, ["Campaign Name (Informational only)", "Campaign Name"], "—")
        ),
        adGroup: normalizeText(
          pick(row, ["Ad Group Name (Informational only)", "Ad Group Name"], "—")
        ),
        term: normalizeText(pick(row, ["Keyword Text", "Product Targeting Expression"], "")),
        matchType: normalizeText(pick(row, ["Match Type"], "—")),
        state: normalizeText(pick(row, ["State"], "—")),
      }))
      .filter((row) => row.term);
  }, [sbCampaignSheet]);

  const existingNegatives = useMemo(() => {
    return [...spExistingNegatives, ...sbExistingNegatives]
      .filter((row) => adType === "All" || row.adType === adType)
      .filter(
        (row) =>
          !query ||
          `${row.term} ${row.campaign} ${row.adGroup} ${row.matchType} ${row.adType}`
            .toLowerCase()
            .includes(query.toLowerCase())
      );
  }, [spExistingNegatives, sbExistingNegatives, adType, query]);

  const existingNegativeSet = useMemo(() => {
    return new Set(existingNegatives.map((row) => `${row.adType}||${row.term.toLowerCase()}`));
  }, [existingNegatives]);

  const unifiedSearchTerms = useMemo(() => {
    const sp = spSearchTermsSheet.map((row) => ({
      adType: "Sponsored Products",
      campaign: normalizeText(pick(row, ["Campaign Name (Informational only)"], "—")),
      adGroup: normalizeText(pick(row, ["Ad Group Name (Informational only)"], "—")),
      state: normalizeText(pick(row, ["State"], "—")),
      keywordText: normalizeText(pick(row, ["Keyword Text"], "")),
      matchType: normalizeText(pick(row, ["Match Type"], "—")),
      searchTerm: normalizeText(pick(row, ["Customer Search Term"], "")),
      clicks: normalizeNumber(pick(row, ["Clicks"], 0)),
      spend: normalizeNumber(pick(row, ["Spend"], 0)),
      orders: normalizeNumber(pick(row, ["Orders"], 0)),
      units: normalizeNumber(pick(row, ["Units"], 0)),
      sales: normalizeNumber(pick(row, ["Sales"], 0)),
      impressions: normalizeNumber(pick(row, ["Impressions"], 0)),
      ctr: normalizeNumber(pick(row, ["Click-through Rate"], 0)) * 100,
      cvr: normalizeNumber(pick(row, ["Conversion Rate"], 0)) * 100,
    }));

    const sb = sbSearchTermsSheet.map((row) => ({
      adType: "Sponsored Brands",
      campaign: normalizeText(pick(row, ["Campaign Name (Informational only)"], "—")),
      adGroup: normalizeText(pick(row, ["Ad Group Name (Informational only)"], "—")),
      state: normalizeText(pick(row, ["State"], "—")),
      keywordText: normalizeText(pick(row, ["Keyword Text"], "")),
      matchType: normalizeText(pick(row, ["Match Type"], "—")),
      searchTerm: normalizeText(pick(row, ["Customer Search Term"], "")),
      clicks: normalizeNumber(pick(row, ["Clicks"], 0)),
      spend: normalizeNumber(pick(row, ["Spend"], 0)),
      orders: normalizeNumber(pick(row, ["Orders"], 0)),
      units: normalizeNumber(pick(row, ["Units"], 0)),
      sales: normalizeNumber(pick(row, ["Sales"], 0)),
      impressions: normalizeNumber(pick(row, ["Impressions"], 0)),
      ctr: normalizeNumber(pick(row, ["Click-through Rate"], 0)) * 100,
      cvr: normalizeNumber(pick(row, ["Conversion Rate"], 0)) * 100,
    }));

    return [...sp, ...sb]
      .filter((row) => row.searchTerm)
      .filter((row) => adType === "All" || row.adType === adType)
      .filter(
        (row) =>
          !query ||
          `${row.searchTerm} ${row.campaign} ${row.adGroup} ${row.keywordText} ${row.adType}`
            .toLowerCase()
            .includes(query.toLowerCase())
      );
  }, [spSearchTermsSheet, sbSearchTermsSheet, adType, query]);

  const recommendedNegatives = useMemo(() => {
    return unifiedSearchTerms
      .filter((row) => row.clicks >= NEGATIVE_CLICK_THRESHOLD && row.orders === 0 && row.units === 0)
      .map((row) => ({
        ...row,
        suggestedNegativeType:
          row.matchType && row.matchType.toLowerCase().includes("broad")
            ? "Negative Phrase"
            : "Negative Exact",
        alreadyBlocked: existingNegativeSet.has(`${row.adType}||${row.searchTerm.toLowerCase()}`),
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [unifiedSearchTerms, existingNegativeSet]);

  const wastedSpendSummary = useMemo(() => {
    const totalWaste = recommendedNegatives.reduce((sum, row) => sum + row.spend, 0);
    const alreadyBlockedCount = recommendedNegatives.filter((row) => row.alreadyBlocked).length;
    const openCount = recommendedNegatives.filter((row) => !row.alreadyBlocked).length;
    const protectedSpend = recommendedNegatives
      .filter((row) => row.alreadyBlocked)
      .reduce((sum, row) => sum + row.spend, 0);
    return { totalWaste, alreadyBlockedCount, openCount, protectedSpend };
  }, [recommendedNegatives]);

  const wasteChartData = useMemo(() => {
    return recommendedNegatives
      .filter((row) => !row.alreadyBlocked)
      .slice(0, 12)
      .map((row) => ({
        name: row.searchTerm.length > 18 ? `${row.searchTerm.slice(0, 18)}…` : row.searchTerm,
        spend: row.spend,
      }));
  }, [recommendedNegatives]);

  const campaignColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    { key: "campaignName", label: "Campaign", type: "text" },
    { key: "state", label: "Status", type: "text" },
    { key: "campaignType", label: "Type", type: "text" },
    { key: "impressions", label: "Impr.", type: "number", render: (r) => compactNumber(r.impressions) },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => compactNumber(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "ctr", label: "CTR", type: "number", render: (r) => pct(r.ctr) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => `${r.roas.toFixed(2)}x` },
  ];

  const productColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    {
      key: "asin",
      label: "Product",
      type: "text",
      sortAccessor: (r) => `${r.asin} ${r.shortTitle}`,
      render: (r) => (
        <div className="flex items-center gap-3">
          <AsinImage src={r.imageUrl} title={r.shortTitle} />
          <div>
            <div className="font-medium text-rose-300">{r.asin}</div>
            <div className="text-xs text-slate-400">{r.shortTitle}</div>
          </div>
        </div>
      ),
    },
    { key: "parentAsin", label: "Parent", type: "text" },
    { key: "itemType", label: "Item Type", type: "text" },
    { key: "brand", label: "Brand", type: "text" },
    { key: "impressions", label: "Impr.", type: "number", render: (r) => compactNumber(r.impressions) },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => compactNumber(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "ctr", label: "CTR", type: "number", render: (r) => pct(r.ctr) },
    { key: "cvr", label: "CVR", type: "number", render: (r) => pct(r.cvr) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => `${r.roas.toFixed(2)}x` },
  ];

  const parentColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    {
      key: "parentAsin",
      label: "Parent ASIN",
      type: "text",
      render: (r) => (
        <div className="flex items-center gap-3">
          <AsinImage src={r.imageUrl} title={r.parentAsin} />
          <div className="font-medium text-rose-300">{r.parentAsin}</div>
        </div>
      ),
    },
    { key: "impressions", label: "Impr.", type: "number", render: (r) => compactNumber(r.impressions) },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => compactNumber(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "ctr", label: "CTR", type: "number", render: (r) => pct(r.ctr) },
    { key: "cvr", label: "CVR", type: "number", render: (r) => pct(r.cvr) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => `${r.roas.toFixed(2)}x` },
  ];

  const itemTypeColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    { key: "itemType", label: "Item Type", type: "text" },
    { key: "impressions", label: "Impr.", type: "number", render: (r) => compactNumber(r.impressions) },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => compactNumber(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "ctr", label: "CTR", type: "number", render: (r) => pct(r.ctr) },
    { key: "cvr", label: "CVR", type: "number", render: (r) => pct(r.cvr) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => `${r.roas.toFixed(2)}x` },
  ];

  const catalogColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    {
      key: "asin",
      label: "Product",
      type: "text",
      sortAccessor: (r) => `${r.asin} ${r.shortTitle}`,
      render: (r) => (
        <div className="flex items-center gap-3">
          <AsinImage src={r.imageUrl} title={r.shortTitle} />
          <div>
            <div className="font-medium text-rose-300">{r.asin}</div>
            <div className="text-xs text-slate-400">{r.shortTitle}</div>
          </div>
        </div>
      ),
    },
    { key: "parentAsin", label: "Parent", type: "text" },
    { key: "itemType", label: "Item Type", type: "text" },
    { key: "brand", label: "Brand", type: "text" },
    { key: "spend", label: "Ad Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Ad Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => `${r.roas.toFixed(2)}x` },
    {
      key: "fbmOnly",
      label: "FBM Only",
      type: "number",
      sortAccessor: (r) => (isFbmOnly(r.asin) ? 1 : 0),
      render: (r) =>
        isFbmOnly(r.asin) ? (
          <span
            className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300"
            title="Listed in the FBM_only sheet — excluded from replenishment suggestions"
          >
            FBM
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
  ];

  const targetingColumns = [
    {
      key: "asin",
      label: "Targeted ASIN",
      type: "text",
      sortAccessor: (r) => `${r.asin} ${r.shortTitle}`,
      render: (r) => (
        <div className="flex items-center gap-3">
          <AsinImage src={r.imageUrl} title={r.shortTitle} />
          <div>
            <a
              href={`https://www.amazon.com/dp/${r.asin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-rose-300 hover:underline"
            >
              {r.asin}
            </a>
            <div className="text-xs text-slate-400">{r.shortTitle}</div>
          </div>
        </div>
      ),
    },
    { key: "brand", label: "Brand", type: "text" },
    { key: "itemType", label: "Item Type", type: "text" },
    { key: "campaignName", label: "Campaign", type: "text" },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => numberFmt(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => `${r.roas.toFixed(2)}x` },
  ];

  const autoTargetColumns = [
    { key: "campaignName", label: "Auto Campaign", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "impressions", label: "Impr.", type: "number", render: (r) => compactNumber(r.impressions) },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => numberFmt(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "ctr", label: "CTR", type: "number", render: (r) => pct(r.ctr) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => `${r.roas.toFixed(2)}x` },
  ];

  const negativeTargetColumns = [
    {
      key: "asin",
      label: "Negative Target",
      type: "text",
      sortAccessor: (r) => `${r.asin} ${r.shortTitle}`,
      render: (r) => (
        <div className="flex items-center gap-3">
          <AsinImage src={r.imageUrl} title={r.shortTitle} />
          <div>
            {r.asin && /^[A-Z0-9]{10}$/.test(r.asin) ? (
              <a
                href={`https://www.amazon.com/dp/${r.asin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-rose-300 hover:underline"
              >
                {r.asin}
              </a>
            ) : (
              <div className="font-medium text-rose-300">{r.asin}</div>
            )}
            <div className="text-xs text-slate-400">{r.shortTitle}</div>
          </div>
        </div>
      ),
    },
    { key: "campaignName", label: "Campaign", type: "text" },
    { key: "adGroupName", label: "Ad Group", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "expression", label: "Expression", type: "text" },
  ];

  const inventoryColumns = [
    {
      key: "asin",
      label: "Product",
      type: "text",
      sortAccessor: (r) => `${r.asin} ${r.shortTitle}`,
      render: (r) => (
        <div className="flex items-center gap-3">
          <AsinImage src={r.imageUrl} title={r.shortTitle} />
          <div>
            <div className="font-medium text-rose-300">{r.asin}</div>
            <div className="text-xs text-slate-400">{r.shortTitle}</div>
          </div>
        </div>
      ),
    },
    { key: "brand", label: "Brand", type: "text" },
    { key: "itemType", label: "Item Type", type: "text" },
    { key: "fbaUnits", label: "FBA", type: "number", render: (r) => numberFmt(r.fbaUnits) },
    { key: "awdUnits", label: "AWD", type: "number", render: (r) => numberFmt(r.awdUnits) },
    { key: "totalUnits", label: "Total", type: "number", render: (r) => numberFmt(r.totalUnits) },
    { key: "units30d", label: "Units 30D", type: "number", render: (r) => numberFmt(r.units30d) },
    { key: "unitsPerDay", label: "Units/Day", type: "number", render: (r) => (r.unitsPerDay ? r.unitsPerDay.toFixed(2) : "—") },
    { key: "daysOfCover", label: "Cover", type: "number", render: (r) => daysLabel(r.daysOfCover) },
    { key: "urgency", label: "Status", type: "text", render: (r) => urgencyPill(r.daysOfCover) },
  ];

  // Plain-data column maps used for CSV/Excel exports — no JSX renderers.
  const inventoryExportColumns = [
    { key: "asin", label: "ASIN" },
    { key: "shortTitle", label: "Title" },
    { key: "brand", label: "Brand" },
    { key: "parentAsin", label: "Parent ASIN" },
    { key: "itemType", label: "Item Type" },
    { key: "fbaUnits", label: "FBA Units" },
    { key: "awdUnits", label: "AWD Units" },
    { key: "totalUnits", label: "Total Units" },
    { key: "units30d", label: "Units (30d)" },
    {
      key: "unitsPerDay",
      label: "Units/Day",
      accessor: (r) => (Number.isFinite(r.unitsPerDay) ? Number(r.unitsPerDay.toFixed(2)) : ""),
    },
    {
      key: "daysOfCover",
      label: "Days of Cover",
      accessor: (r) =>
        Number.isFinite(r.daysOfCover) ? Number(r.daysOfCover.toFixed(1)) : "No sales",
    },
    { key: "urgency", label: "Status" },
  ];

  const riskChartExportColumns = [
    { key: "name", label: "Product" },
    {
      key: "days",
      label: "Days of Cover",
      accessor: (r) => (Number.isFinite(r.days) ? Number(r.days.toFixed(1)) : ""),
    },
  ];

  const recommendedColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    { key: "searchTerm", label: "Search Term", type: "text" },
    { key: "campaign", label: "Campaign", type: "text" },
    { key: "adGroup", label: "Ad Group", type: "text" },
    { key: "keywordText", label: "Keyword", type: "text" },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => numberFmt(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "units", label: "Units", type: "number", render: (r) => numberFmt(r.units) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "suggestedNegativeType", label: "Suggested Type", type: "text" },
    {
      key: "alreadyBlocked",
      label: "Action",
      type: "text",
      render: (r) => recommendationPill(r),
      sortAccessor: (r) => (r.alreadyBlocked ? "z" : "a"),
    },
  ];

  const existingNegativeColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    { key: "entity", label: "Entity", type: "text" },
    { key: "term", label: "Negative Term", type: "text" },
    { key: "matchType", label: "Match Type", type: "text" },
    { key: "campaign", label: "Campaign", type: "text" },
    { key: "adGroup", label: "Ad Group", type: "text" },
    { key: "state", label: "State", type: "text" },
  ];

  const allSearchTermColumns = [
    { key: "adType", label: "Ad Type", type: "text" },
    { key: "searchTerm", label: "Search Term", type: "text" },
    { key: "campaign", label: "Campaign", type: "text" },
    { key: "adGroup", label: "Ad Group", type: "text" },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => numberFmt(r.clicks) },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "units", label: "Units", type: "number", render: (r) => numberFmt(r.units) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "ctr", label: "CTR", type: "number", render: (r) => pct(r.ctr) },
    { key: "cvr", label: "CVR", type: "number", render: (r) => pct(r.cvr) },
  ];

  const campaignSort = useSortableRows(unifiedCampaignRows, { key: "spend", type: "number", direction: "desc" });
  const trendsSort = useSortableRows(campaignTrendRows, { key: "spend", type: "number", direction: "desc" });

  // Columns for the Campaign Trends table — current-window metrics + the 7/30/60
  // ROAS triplet so the trend is visible at a glance, plus the recommended action.
  const trendArrow = (a, b) => {
    if (a == null || b == null) return "";
    if (a > b) return "▲";
    if (a < b) return "▼";
    return "·";
  };
  const fmtRoas = (v) => (v == null ? "—" : `${Number(v).toFixed(2)}x`);
  const trendsColumns = [
    {
      key: "campaignName",
      label: "Campaign",
      type: "text",
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-rose-300">{r.campaignName || "—"}</div>
          <div className="text-xs text-slate-400">
            {r.adType} · {r.state}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "Recommendation",
      type: "text",
      sortAccessor: (r) => r.category,
      render: (r) => (
        <div className="flex flex-col gap-1">
          <CategoryPill categoryId={r.category} />
          {r.recommendedAction ? (
            <span className="text-[11px] text-slate-400">{r.recommendedAction}</span>
          ) : null}
        </div>
      ),
    },
    { key: "spend", label: "Spend", type: "number", render: (r) => currency(r.spend) },
    { key: "sales", label: "Sales", type: "number", render: (r) => currency(r.sales) },
    { key: "orders", label: "Orders", type: "number", render: (r) => numberFmt(r.orders) },
    { key: "clicks", label: "Clicks", type: "number", render: (r) => numberFmt(r.clicks) },
    { key: "ctr", label: "CTR", type: "number", render: (r) => pct(r.ctr) },
    { key: "acos", label: "ACOS", type: "number", render: (r) => pct(r.acos) },
    { key: "roas", label: "ROAS", type: "number", render: (r) => fmtRoas(r.roas) },
    {
      key: "trend",
      label: "Trend (7 / 30 / 60)",
      type: "number",
      sortAccessor: (r) => r.roas7 ?? -1,
      render: (r) => (
        <div className="flex items-center gap-2 text-xs">
          <span>{fmtRoas(r.roas7)}</span>
          <span className="text-slate-500">{trendArrow(r.roas7, r.roas30)}</span>
          <span>{fmtRoas(r.roas30)}</span>
          <span className="text-slate-500">{trendArrow(r.roas30, r.roas60)}</span>
          <span>{fmtRoas(r.roas60)}</span>
        </div>
      ),
    },
  ];

  // Plain export columns (no JSX renderers) for the CSV.
  const trendsExportColumns = [
    { key: "campaignName", label: "Campaign" },
    { key: "adType", label: "Ad Type" },
    { key: "state", label: "State" },
    { key: "category", label: "Category" },
    { key: "recommendedAction", label: "Recommended Action" },
    { key: "spend", label: "Spend" },
    { key: "sales", label: "Sales" },
    { key: "orders", label: "Orders" },
    { key: "clicks", label: "Clicks" },
    { key: "impressions", label: "Impressions" },
    { key: "ctr", label: "CTR %", accessor: (r) => Number((r.ctr || 0).toFixed(2)) },
    { key: "acos", label: "ACOS %", accessor: (r) => Number((r.acos || 0).toFixed(2)) },
    { key: "roas", label: "ROAS", accessor: (r) => Number((r.roas || 0).toFixed(2)) },
    { key: "roas7", label: "ROAS 7d", accessor: (r) => (r.roas7 == null ? "" : Number(r.roas7.toFixed(2))) },
    { key: "roas30", label: "ROAS 30d", accessor: (r) => (r.roas30 == null ? "" : Number(r.roas30.toFixed(2))) },
    { key: "roas60", label: "ROAS 60d", accessor: (r) => (r.roas60 == null ? "" : Number(r.roas60.toFixed(2))) },
  ];
  const productSort = useSortableRows(productGrouped, { key: "spend", type: "number", direction: "desc" });
  const parentSort = useSortableRows(parentGrouped, { key: "spend", type: "number", direction: "desc" });
  const itemTypeSort = useSortableRows(itemTypeGrouped, { key: "spend", type: "number", direction: "desc" });
  const catalogSort = useSortableRows(productGrouped.slice(0, 500), { key: "sales", type: "number", direction: "desc" });
  const inventorySort = useSortableRows(inventoryFiltered, { key: "daysOfCover", type: "number", direction: "asc" });
  const urgentSort = useSortableRows(urgentInventory, { key: "daysOfCover", type: "number", direction: "asc" });
  const replenishSort = useSortableRows(replenishInventory, { key: "daysOfCover", type: "number", direction: "asc" });
  const recommendedSort = useSortableRows(recommendedNegatives, { key: "spend", type: "number", direction: "desc" });
  const existingNegativeSort = useSortableRows(existingNegatives, { key: "term", type: "text", direction: "asc" });
  const allSearchTermSort = useSortableRows(unifiedSearchTerms, { key: "spend", type: "number", direction: "desc" });
  const targetingSort = useSortableRows(competitorTargets, { key: "spend", type: "number", direction: "desc" });
  const autoTargetSort = useSortableRows(autoCampaignTargets, { key: "spend", type: "number", direction: "desc" });
  const negativeTargetSort = useSortableRows(negativeProductTargets, { key: "campaignName", type: "text", direction: "asc" });

  const targetingSummary = useMemo(() => {
    const competitorSpend = competitorTargets.reduce((sum, row) => sum + row.spend, 0);
    const competitorSales = competitorTargets.reduce((sum, row) => sum + row.sales, 0);
    const orders = competitorTargets.reduce((sum, row) => sum + row.orders, 0);
    const autoSpend = autoCampaignTargets.reduce((sum, row) => sum + row.spend, 0);
    const autoSales = autoCampaignTargets.reduce((sum, row) => sum + row.sales, 0);
    return {
      count: competitorTargets.length,
      spend: competitorSpend,
      sales: competitorSales,
      orders,
      acos: competitorSales ? (competitorSpend / competitorSales) * 100 : 0,
      autoCount: autoCampaignTargets.length,
      autoSpend,
      autoSales,
      negativeCount: negativeProductTargets.length,
      blendedSpend: competitorSpend + autoSpend,
      blendedSales: competitorSales + autoSales,
    };
  }, [competitorTargets, autoCampaignTargets, negativeProductTargets]);

  const tabs = [
    { id: "overview", label: "Overview", icon: DollarSign },
    { id: "advertising", label: "Advertising", icon: Megaphone },
    { id: "campaignTrends", label: "Campaign Trends", icon: TrendingUp },
    { id: "targeting", label: "Targeting", icon: Search },
    { id: "searchTerms", label: "Search Terms", icon: ShieldMinus },
    { id: "inventory", label: "Inventory", icon: Warehouse },
    { id: "catalog", label: "Catalog", icon: Package },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading Google Sheets data...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-r border-slate-900 bg-slate-950/80 p-5 backdrop-blur xl:sticky xl:top-0 xl:h-screen">
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
            <img src={LOGO_URL} alt="Sqairz" className="h-8 w-auto object-contain" />
            <p className="mt-3 text-sm text-slate-400">Seller Central Dashboard</p>
          </div>

          <div className="mt-6 space-y-2">
            {tabs.map((tab) => (
              <SidebarButton
                key={tab.id}
                active={activeTab === tab.id}
                icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
        </aside>

        <main className="p-4 md:p-6 xl:p-8">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Sqairz Dashboard
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Seller Central only. Live from Google Sheets.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search campaign, ASIN, parent, item type..."
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-10 py-3 text-sm text-white outline-none placeholder:text-slate-500 md:w-80"
                />
              </div>

              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>

          {error ? (
            <div className="mb-6 rounded-2xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {activeTab === "overview" && (
            <div className="space-y-6">
              <SectionCard title="Monthly Sales & Profit Trend" subtitle="Sales from sales_monthly. Profit will populate once profit data is added.">
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <BarChart data={monthlySalesChartData}>
                      <CartesianGrid stroke="#172033" vertical={false} />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={12}
                        tickFormatter={(v) => `$${compactNumber(v)}`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#020617",
                          border: "1px solid #1e293b",
                          borderRadius: 16,
                        }}
                        formatter={(value, name) =>
                          name === "profit"
                            ? value === null
                              ? "Pending"
                              : currency(value)
                            : currency(value)
                        }
                      />
                      <Bar dataKey="sales" radius={[8, 8, 0, 0]} fill="#334f74" />
                      <Line type="monotone" dataKey="profit" stroke="#34d399" strokeWidth={2} dot={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="This Month Sales"
                  value={currentMonthRow?.sales || 0}
                  icon={DollarSign}
                />
                <StatCard
                  label="This Month Units"
                  value={currentMonthRow?.units || 0}
                  suffix="count"
                  icon={Package}
                />
                <StatCard label="Ad Spend" value={adSummary.spend} icon={Megaphone} />
                <StatCard
                  label="ROAS"
                  value={adSummary.roas}
                  suffix="x"
                  icon={BarChart3}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ComparisonCard
                  title="Sales vs Last Month"
                  value={salesVsLastMonth === null ? "—" : pct(salesVsLastMonth)}
                  positive={salesVsLastMonth === null ? null : salesVsLastMonth >= 0}
                  subtitle={
                    previousMonthRow
                      ? `${currentMonthRow?.label || "Current"} vs ${previousMonthRow.label}`
                      : "Waiting for prior month data"
                  }
                />
                <ComparisonCard
                  title="Profit vs Last Month"
                  value={profitVsLastMonth === null ? "Pending" : pct(profitVsLastMonth)}
                  positive={profitVsLastMonth === null ? null : profitVsLastMonth >= 0}
                  subtitle="Will activate automatically when monthly profit is added"
                />
                <ComparisonCard
                  title="Sales vs Same Month LY"
                  value={salesVsLastYear === null ? "—" : pct(salesVsLastYear)}
                  positive={salesVsLastYear === null ? null : salesVsLastYear >= 0}
                  subtitle={
                    sameMonthLastYearRow
                      ? `${currentMonthRow?.label || "Current"} vs ${sameMonthLastYearRow.label}`
                      : "Waiting for same month last year data"
                  }
                />
                <ComparisonCard
                  title="Profit vs Same Month LY"
                  value={profitVsLastYear === null ? "Pending" : pct(profitVsLastYear)}
                  positive={profitVsLastYear === null ? null : profitVsLastYear >= 0}
                  subtitle="Will activate automatically when monthly profit is added"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionCard title="Revenue by Brand" subtitle="30 day total sales">
                  <div className="space-y-4">
                    {revenueByBrand.map((row) => (
                      <div key={row.brand}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-200">{row.brand}</span>
                          <span className="text-sm font-medium text-white">{currency(row.sales)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-900">
                          <div
                            className="h-2 rounded-full bg-rose-400"
                            style={{
                              width: `${(row.sales / (revenueByBrand[0]?.sales || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Revenue by Category" subtitle="30 day total sales">
                  <div className="space-y-4">
                    {revenueByCategory.map((row) => (
                      <div key={row.category}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-200">{row.category}</span>
                          <span className="text-sm font-medium text-white">{currency(row.sales)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-900">
                          <div
                            className="h-2 rounded-full bg-emerald-400"
                            style={{
                              width: `${(row.sales / (revenueByCategory[0]?.sales || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
                <SectionCard title="Top Products" subtitle="Top 5 by 30 day total sales">
                  <div className="space-y-3">
                    {topProductsList.map((row, index) => (
                      <div
                        key={`${row.adType}-${row.asin}`}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-400/20 text-xs font-semibold text-rose-300">
                            #{index + 1}
                          </div>
                          <AsinImage src={row.imageUrl} title={row.shortTitle} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{row.shortTitle}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              {row.asin} · {row.brand || "Unknown"} · {row.itemType || "Unknown"}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-white">{currency(row.sales30d)}</div>
                          <div className="mt-1 text-xs text-slate-400">{numberFmt(row.units30d)} units</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <div className="grid grid-cols-1 gap-6">
                  <SectionCard title="Advertising" subtitle="30 day summary">
                    <div className="space-y-4 text-sm">
                      <div className="flex items-center justify-between"><span className="text-slate-400">Active Campaigns</span><span className="font-medium text-white">{numberFmt(unifiedCampaignRows.length)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">Total Spend</span><span className="font-medium text-white">{currency(adSummary.spend)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">Sales</span><span className="font-medium text-white">{currency(adSummary.sales)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">ACOS</span><span className="font-medium text-white">{pct(adSummary.acos)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">ROAS</span><span className="font-medium text-white">{adSummary.roas.toFixed(2)}x</span></div>
                    </div>
                  </SectionCard>

                  <SectionCard title="Inventory" subtitle="Network-level availability">
                    <div className="space-y-4 text-sm">
                      <div className="flex items-center justify-between"><span className="text-slate-400">FBA Units</span><span className="font-medium text-white">{numberFmt(inventorySummary.totalFba)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">AWD Units</span><span className="font-medium text-white">{numberFmt(inventorySummary.totalAwd)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">At Risk ASINs</span><span className="font-medium text-amber-300">{numberFmt(inventorySummary.atRisk)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">Urgent ASINs</span><span className="font-medium text-rose-300">{numberFmt(inventorySummary.urgent)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-400">Blended Cover</span><span className="font-medium text-white">{daysLabel(inventorySummary.blendedDays)}</span></div>
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          )}

          {activeTab === "advertising" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Spend" value={adSummary.spend} icon={Megaphone} />
                <StatCard label="Sales" value={adSummary.sales} icon={DollarSign} />
                <StatCard label="ACOS" value={adSummary.acos} suffix="%" icon={BarChart3} />
                <StatCard label="ROAS" value={adSummary.roas} suffix="x" icon={RefreshCw} />
              </div>

              <SectionCard
                title="Advertising Performance"
                subtitle="Now supports Sponsored Products, Sponsored Brands, and Sponsored Display"
                right={
                  <TogglePills
                    value={adView}
                    onChange={setAdView}
                    options={["Campaign", "Product", "Parent", "Item Type"]}
                  />
                }
              >
                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <FilterSelect label="Ad Type" value={adType} onChange={setAdType} options={adTypeOptions} />
                  <FilterSelect label="Brand" value={brandFilter} onChange={setBrandFilter} options={brandOptions} />
                  <FilterSelect label="Item Type" value={itemTypeFilter} onChange={setItemTypeFilter} options={itemTypeOptions} />
                  <FilterSelect label="Parent ASIN" value={parentFilter} onChange={setParentFilter} options={parentOptions} />
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setAdType("All");
                        setBrandFilter("All");
                        setItemTypeFilter("All");
                        setParentFilter("All");
                      }}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-slate-800"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>

                {adView === "Campaign" && (
                  <SortableTable
                    rowKey="campaignName"
                    columns={campaignColumns}
                    rows={campaignSort.sortedRows}
                    sortConfig={campaignSort.sortConfig}
                    onSort={campaignSort.handleSort}
                  />
                )}
                {adView === "Product" && (
                  <SortableTable
                    rowKey={(row) => `${row.adType}-${row.asin}`}
                    columns={productColumns}
                    rows={productSort.sortedRows}
                    sortConfig={productSort.sortConfig}
                    onSort={productSort.handleSort}
                  />
                )}
                {adView === "Parent" && (
                  <SortableTable
                    rowKey={(row) => `${row.adType}-${row.parentAsin}`}
                    columns={parentColumns}
                    rows={parentSort.sortedRows}
                    sortConfig={parentSort.sortConfig}
                    onSort={parentSort.handleSort}
                  />
                )}
                {adView === "Item Type" && (
                  <SortableTable
                    rowKey={(row) => `${row.adType}-${row.itemType}`}
                    columns={itemTypeColumns}
                    rows={itemTypeSort.sortedRows}
                    sortConfig={itemTypeSort.sortConfig}
                    onSort={itemTypeSort.handleSort}
                  />
                )}
              </SectionCard>
            </div>
          )}

          {activeTab === "campaignTrends" && (
            <div className="space-y-6">
              {/* Window selector + filters */}
              <SectionCard
                title="Campaign Trends"
                subtitle="Compare campaign performance across the 7, 30, and 60-day windows. The 30-day window is the default; the 7 and 60-day windows are read from the *_7 and *_60 sheet tabs."
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                      Lookback window
                    </p>
                    <TogglePills
                      value={campaignWindow}
                      onChange={setCampaignWindow}
                      options={["7", "30", "60"]}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:min-w-[520px]">
                    <FilterSelect
                      label="Ad Type"
                      value={adType}
                      onChange={setAdType}
                      options={adTypeOptions}
                    />
                    <FilterSelect
                      label="Item Type"
                      value={itemTypeFilter}
                      onChange={setItemTypeFilter}
                      options={itemTypeOptions}
                    />
                    <FilterSelect
                      label="Brand"
                      value={brandFilter}
                      onChange={setBrandFilter}
                      options={brandOptions}
                    />
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Item Type filtering matches campaigns whose name contains the selected
                  text — accuracy depends on your campaign naming convention.
                </p>
              </SectionCard>

              {/* Recommended Actions cards (clickable to filter) */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {CAMPAIGN_CATEGORIES.map((cat) => {
                  const count = campaignCategoryCounts[cat.id] ?? 0;
                  const isActive = campaignActionFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCampaignActionFilter(cat.id)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition",
                        isActive
                          ? CATEGORY_TONE_CLASSES[cat.tone] + " ring-2 ring-rose-400/40"
                          : "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs uppercase tracking-wider text-slate-400">
                          {cat.label}
                        </span>
                        <span className="text-2xl font-semibold text-white">
                          {numberFmt(count)}
                        </span>
                      </div>
                      {cat.action ? (
                        <p className="mt-2 text-xs text-slate-400">{cat.action}</p>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Show all categories</p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Trends table */}
              <SectionCard
                title={`Campaigns — ${campaignWindow}-day window`}
                subtitle={
                  campaignActionFilter === "all"
                    ? "All campaigns. Click a card above to filter by recommended action."
                    : `Filtered to: ${
                        (CAMPAIGN_CATEGORIES.find((c) => c.id === campaignActionFilter) || {}).label
                      }`
                }
                right={
                  <ExportButton
                    filename={`campaign-trends-${campaignWindow}d.csv`}
                    rows={trendsSort.sortedRows}
                    columns={trendsExportColumns}
                  />
                }
              >
                {trendsSort.sortedRows.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
                    No campaigns match the current filters. If the 7 or 60-day windows
                    look empty, confirm the corresponding sheet tabs (
                    <code>Sponsored Products Campaigns_7</code>,{" "}
                    <code>Sponsored Brands Campaigns_60</code>, etc.) exist and contain
                    campaign rows.
                  </div>
                ) : (
                  <SortableTable
                    rowKey={(row) => `${row.adType}||${row.campaignName}`}
                    columns={trendsColumns}
                    rows={trendsSort.sortedRows}
                    sortConfig={trendsSort.sortConfig}
                    onSort={trendsSort.handleSort}
                  />
                )}
              </SectionCard>
            </div>
          )}

          {activeTab === "targeting" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                <CountCard label="Competitor Targets" value={targetingSummary.count} icon={Search} tone="sky" />
                <StatCard label="Competitor Spend" value={targetingSummary.spend} icon={Megaphone} tone="amber" />
                <StatCard label="Competitor Sales" value={targetingSummary.sales} icon={DollarSign} tone="emerald" />
                <StatCard label="Competitor ACOS" value={targetingSummary.acos} suffix="%" icon={BarChart3} tone="rose" />
                <CountCard label="Auto Campaigns" value={targetingSummary.autoCount} icon={RefreshCw} tone="sky" />
                <CountCard label="Negative Product Targets" value={targetingSummary.negativeCount} icon={Ban} tone="amber" />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionCard
                  title="High-Spend / No-Order Targets"
                  subtitle="Competitor ASIN targets that have spent meaningfully without converting"
                >
                  <div className="space-y-3">
                    {targetingInsights.highSpendNoOrders.length === 0 ? (
                      <div className="rounded-2xl border border-emerald-900 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                        No competitor targets currently meet the high-spend / no-order threshold.
                      </div>
                    ) : (
                      targetingInsights.highSpendNoOrders.map((row) => (
                        <div
                          key={`waste-${row.asin}`}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <AsinImage src={row.imageUrl} title={row.shortTitle} />
                            <div className="min-w-0">
                              <a
                                href={`https://www.amazon.com/dp/${row.asin}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate font-medium text-rose-300 hover:underline"
                              >
                                {row.asin}
                              </a>
                              <div className="truncate text-xs text-slate-400">{row.shortTitle}</div>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-semibold text-white">{currency(row.spend)}</div>
                            <div className="text-xs text-slate-400">0 orders</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Best ROAS Competitor Targets"
                  subtitle="Current winners worth watching for scale opportunities"
                >
                  <div className="space-y-3">
                    {targetingInsights.bestRoas.length === 0 ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
                        No competitor targets with enough spend and orders yet.
                      </div>
                    ) : (
                      targetingInsights.bestRoas.map((row) => (
                        <div
                          key={`winner-${row.asin}`}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <AsinImage src={row.imageUrl} title={row.shortTitle} />
                            <div className="min-w-0">
                              <a
                                href={`https://www.amazon.com/dp/${row.asin}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate font-medium text-rose-300 hover:underline"
                              >
                                {row.asin}
                              </a>
                              <div className="truncate text-xs text-slate-400">{row.shortTitle}</div>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-semibold text-white">{row.roas.toFixed(2)}x ROAS</div>
                            <div className="text-xs text-slate-400">{currency(row.sales)} sales</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="Competitor ASIN Targeting"
                subtitle="Manual product targets currently aimed at competitor ASINs"
              >
                <SortableTable
                  rowKey={(row) => row.asin}
                  columns={targetingColumns}
                  rows={targetingSort.sortedRows}
                  sortConfig={targetingSort.sortConfig}
                  onSort={targetingSort.handleSort}
                />
              </SectionCard>

              <SectionCard
                title="Auto Campaign Performance"
                subtitle="Auto campaigns shown here so targeting strategy can be reviewed alongside competitor ASIN targeting"
              >
                <SortableTable
                  rowKey={(row) => row.campaignName}
                  columns={autoTargetColumns}
                  rows={autoTargetSort.sortedRows}
                  sortConfig={autoTargetSort.sortConfig}
                  onSort={autoTargetSort.handleSort}
                />
              </SectionCard>

              <SectionCard
                title="Negative Product Targets"
                subtitle="ASINs currently excluded from Sponsored Products campaigns and ad groups"
              >
                <SortableTable
                  rowKey={(row, idx) => `${row.asin}-${row.campaignName}-${row.adGroupName}-${idx}`}
                  columns={negativeTargetColumns}
                  rows={negativeTargetSort.sortedRows}
                  sortConfig={negativeTargetSort.sortConfig}
                  onSort={negativeTargetSort.handleSort}
                />
              </SectionCard>
            </div>
          )}

          {activeTab === "searchTerms" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <CountCard label="Recommended Negatives" value={wastedSpendSummary.openCount} icon={ShieldMinus} tone="amber" />
                <CountCard label="Existing Negatives" value={existingNegatives.length} icon={Ban} tone="sky" />
                <StatCard label="Wasted Spend 60D" value={wastedSpendSummary.totalWaste} icon={BadgeDollarSign} tone="rose" />
                <StatCard label="Spend Already Protected" value={wastedSpendSummary.protectedSpend} icon={ShieldMinus} tone="emerald" />
              </div>

              <div className="space-y-6">
                <SectionCard
                  title="Top Waste Terms"
                  subtitle="Highest-spend search terms still recommended for negative matching"
                >
                  <div className="h-96 w-full">
                    <ResponsiveContainer>
                      <BarChart data={wasteChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <CartesianGrid stroke="#172033" horizontal={false} />
                        <XAxis type="number" stroke="#64748b" tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          stroke="#64748b"
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#020617",
                            border: "1px solid #1e293b",
                            borderRadius: 16,
                          }}
                          formatter={(v) => currency(v)}
                        />
                        <Bar dataKey="spend" radius={[0, 8, 8, 0]} fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Search Term Intelligence"
                  subtitle="Shows existing negatives plus search terms with 12+ clicks and no conversions"
                  right={<TogglePills value={searchView} onChange={setSearchView} options={["Recommended", "Existing Negatives", "All Terms"]} />}
                >
                  <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <FilterSelect label="Ad Type" value={adType} onChange={setAdType} options={adTypeOptions} />
                    <FilterSelect label="Brand" value={brandFilter} onChange={setBrandFilter} options={brandOptions} />
                    <FilterSelect label="Item Type" value={itemTypeFilter} onChange={setItemTypeFilter} options={itemTypeOptions} />
                    <FilterSelect label="Parent ASIN" value={parentFilter} onChange={setParentFilter} options={parentOptions} />
                  </div>

                  {searchView === "Recommended" && (
                    <SortableTable
                      rowKey={(row, i) => `${row.adType}-${row.searchTerm}-${i}`}
                      columns={recommendedColumns}
                      rows={recommendedSort.sortedRows}
                      sortConfig={recommendedSort.sortConfig}
                      onSort={recommendedSort.handleSort}
                    />
                  )}
                  {searchView === "Existing Negatives" && (
                    <SortableTable
                      rowKey={(row, i) => `${row.adType}-${row.term}-${i}`}
                      columns={existingNegativeColumns}
                      rows={existingNegativeSort.sortedRows}
                      sortConfig={existingNegativeSort.sortConfig}
                      onSort={existingNegativeSort.handleSort}
                    />
                  )}
                  {searchView === "All Terms" && (
                    <SortableTable
                      rowKey={(row, i) => `${row.adType}-${row.searchTerm}-${i}`}
                      columns={allSearchTermColumns}
                      rows={allSearchTermSort.sortedRows}
                      sortConfig={allSearchTermSort.sortConfig}
                      onSort={allSearchTermSort.handleSort}
                    />
                  )}
                </SectionCard>
              </div>
            </div>
          )}

          {activeTab === "inventory" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <CountCard label="Blended Cover" value={inventorySummary.blendedDays} suffix="count" icon={Clock3} tone="sky" />
                <CountCard label="At Risk < 60d" value={inventorySummary.atRisk} icon={Boxes} tone="amber" />
                <CountCard label="Urgent < 14d" value={inventorySummary.urgent} icon={AlertTriangle} tone="rose" />
                <CountCard label="FBA Units" value={inventorySummary.totalFba} icon={Warehouse} tone="sky" />
                <CountCard label="AWD Units" value={inventorySummary.totalAwd} icon={Truck} tone="emerald" />
              </div>

              <div className="space-y-6">
                <SectionCard
                  title="Urgent Block"
                  subtitle="ASINs below 2 weeks of cover need immediate attention"
                  right={
                    <ExportButton
                      filename="urgent-inventory.csv"
                      rows={urgentSort.sortedRows.slice(0, 25)}
                      columns={inventoryExportColumns}
                    />
                  }
                >
                  {urgentInventory.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-900 bg-emerald-500/10 p-5 text-sm text-emerald-300">
                      No ASINs are below 2 weeks of cover.
                    </div>
                  ) : (
                    <SortableTable
                      rowKey="asin"
                      columns={inventoryColumns}
                      rows={urgentSort.sortedRows.slice(0, 25)}
                      sortConfig={urgentSort.sortConfig}
                      onSort={urgentSort.handleSort}
                    />
                  )}
                </SectionCard>

                <SectionCard
                  title="Replenishment Watch"
                  subtitle="ASINs below 2 months of cover but above urgent threshold"
                  right={
                    <ExportButton
                      filename="replenishment-watch.csv"
                      rows={replenishSort.sortedRows.slice(0, 25)}
                      columns={inventoryExportColumns}
                    />
                  }
                >
                  {replenishInventory.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-900 bg-emerald-500/10 p-5 text-sm text-emerald-300">
                      Nothing currently falls into the watch window.
                    </div>
                  ) : (
                    <SortableTable
                      rowKey="asin"
                      columns={inventoryColumns}
                      rows={replenishSort.sortedRows.slice(0, 25)}
                      sortConfig={replenishSort.sortConfig}
                      onSort={replenishSort.handleSort}
                    />
                  )}
                </SectionCard>

                <SectionCard
                  title="Inventory Risk by ASIN"
                  subtitle="All tracked ASINs, sortable by cover, stock, and sales"
                  right={
                    <ExportButton
                      filename="inventory-risk.csv"
                      rows={inventorySort.sortedRows.filter(
                        (r) => !fbmOnlyAsins.has(String(r.asin || "").trim().toUpperCase())
                      )}
                      columns={inventoryExportColumns}
                    />
                  }
                >
                  <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <FilterSelect label="Inventory View" value={inventoryFilter} onChange={setInventoryFilter} options={["All", "urgent", "replenish", "healthy", "no_sales"]} />
                    <FilterSelect label="Brand" value={brandFilter} onChange={setBrandFilter} options={brandOptions} />
                    <FilterSelect label="Item Type" value={itemTypeFilter} onChange={setItemTypeFilter} options={itemTypeOptions} />
                    <FilterSelect label="Parent ASIN" value={parentFilter} onChange={setParentFilter} options={parentOptions} />
                  </div>
                  <SortableTable
                    rowKey="asin"
                    columns={inventoryColumns}
                    rows={inventorySort.sortedRows}
                    sortConfig={inventorySort.sortConfig}
                    onSort={inventorySort.handleSort}
                  />
                </SectionCard>

                <SectionCard
                  title="Lowest Cover ASINs"
                  subtitle="Quick visual for the 12 tightest stock positions"
                  right={
                    <ExportButton
                      filename="lowest-cover-asins.csv"
                      rows={riskChartExportRows}
                      columns={riskChartExportColumns}
                    />
                  }
                >
                  <div className="h-96 w-full">
                    <ResponsiveContainer>
                      <BarChart data={riskChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <CartesianGrid stroke="#172033" horizontal={false} />
                        <XAxis type="number" stroke="#64748b" tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          stroke="#64748b"
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#020617",
                            border: "1px solid #1e293b",
                            borderRadius: 16,
                          }}
                          formatter={(v) => daysLabel(v)}
                        />
                        <Bar dataKey="days" radius={[0, 8, 8, 0]} fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
              </div>
            </div>
          )}

          {activeTab === "catalog" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <CountCard label="Reference Rows" value={referenceSheet.length} icon={Package} tone="sky" />
                <CountCard label="Products in Ad Report" value={productGrouped.length} icon={Boxes} tone="sky" />
                <CountCard label="Mapped Parents" value={parentGrouped.length} icon={Package} tone="emerald" />
                <CountCard label="Item Types" value={itemTypeGrouped.length} icon={Package} tone="amber" />
              </div>

              <SectionCard title="Catalog Preview" subtitle="Sortable and filter-aware">
                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <FilterSelect label="Ad Type" value={adType} onChange={setAdType} options={adTypeOptions} />
                  <FilterSelect label="Brand" value={brandFilter} onChange={setBrandFilter} options={brandOptions} />
                  <FilterSelect label="Item Type" value={itemTypeFilter} onChange={setItemTypeFilter} options={itemTypeOptions} />
                  <FilterSelect label="Parent ASIN" value={parentFilter} onChange={setParentFilter} options={parentOptions} />
                </div>
                <SortableTable
                  rowKey={(row) => `${row.adType}-${row.asin}`}
                  columns={catalogColumns}
                  rows={catalogSort.sortedRows}
                  sortConfig={catalogSort.sortConfig}
                  onSort={catalogSort.handleSort}
                />
              </SectionCard>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
                                                                                                                                                                                                                                                                                                                                                                                  