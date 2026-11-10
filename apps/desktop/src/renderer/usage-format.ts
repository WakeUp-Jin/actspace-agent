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
