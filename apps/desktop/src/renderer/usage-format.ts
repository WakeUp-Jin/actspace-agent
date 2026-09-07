const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function formatUsdCost(value: number): string {
  return Number.isFinite(value) ? value > 0 && value < 0.000001 ? "<$0.000001" : USD_FORMATTER.format(value) : "—";
}

export function formatUsageAmount(value: number | null | undefined, currency = "USD"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (currency === "USD") return formatUsdCost(value);
  const formatter = new Intl.NumberFormat("zh-CN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return value > 0 && value < 0.000001 ? `<${formatter.format(0.000001)}` : formatter.format(value);
}
