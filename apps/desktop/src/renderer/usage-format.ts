const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function formatUsdCost(value: number): string {
  return USD_FORMATTER.format(Number.isFinite(value) ? value : 0);
}
