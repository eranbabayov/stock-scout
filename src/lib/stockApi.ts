import { apiFetch } from "@/lib/apiClient";

export interface StockDataPoint {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface StockQuote {
  symbol: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export async function fetchStockData(symbols: string[]): Promise<Record<string, StockDataPoint[]>> {
  return apiFetch("/stock-data/fetch", {
    method: "POST",
    body: JSON.stringify({ symbols, period: "1y" }),
  });
}

export async function validateStock(symbol: string): Promise<boolean> {
  try {
    const data = await apiFetch<{ valid: boolean }>("/stock-data/validate", {
      method: "POST",
      body: JSON.stringify({ symbol }),
    });
    return data?.valid ?? false;
  } catch {
    return false;
  }
}

export function calcEMA(data: StockDataPoint[], period: number): { date: string; value: number }[] {
  if (data.length === 0) return [];

  const alpha = 2 / (period + 1);
  const result: { date: string; value: number }[] = [];
  let previousEma = data[0].close;
  console.log("previousEma:")
  console.log(previousEma)

  for (const point of data) {
    previousEma = alpha * point.close + (1 - alpha) * previousEma;
    result.push({ date: point.date, value: Math.round(previousEma * 100) / 100 });
  }

  return result;
}

export function calcSMA(data: StockDataPoint[], period: number): { date: string; value: number }[] {
  if (data.length === 0) return [];

  const result: { date: string; value: number }[] = [];
  let windowSum = 0;

  for (let i = 0; i < data.length; i++) {
    windowSum += data[i].close;
    if (i >= period) {
      windowSum -= data[i - period].close;
    }
    const windowSize = Math.min(i + 1, period);
    result.push({ date: data[i].date, value: Math.round((windowSum / windowSize) * 100) / 100 });
  }

  return result;
}

export type MovingAverageType = "EMA" | "SMA";

export interface MovingAverageIndicator {
  type: MovingAverageType;
  period: number;
}

function calcMovingAverage(
  data: StockDataPoint[],
  indicator: MovingAverageIndicator
): { date: string; value: number }[] {
  return indicator.type === "SMA" ? calcSMA(data, indicator.period) : calcEMA(data, indicator.period);
}

export function getQuoteFromData(data: StockDataPoint[]): StockQuote | null {
  if (data.length < 2) return null;
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const change = last.close - prev.close;
  const changePercent = (change / prev.close) * 100;

  return {
    symbol: last.symbol,
    lastPrice: Math.round(last.close * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    previousClose: Math.round(prev.close * 100) / 100,
  };
}

export function checkStocksAboveAvg(
  stocksData: Record<string, StockDataPoint[]>,
  indicators: MovingAverageIndicator[],
  lowerThresholdPercent: number = 0,
  upperThresholdPercent: number = Infinity
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const [symbol, data] of Object.entries(stocksData)) {
    if (!Array.isArray(data) || data.length === 0) continue;

    const lastClose = data[data.length - 1].close;
    const matches: Record<string, number> = {};

    // AND semantics: a symbol only qualifies if every selected indicator
    // is within the threshold range, so stop at the first one that fails.
    for (const indicator of indicators) {
      const series = calcMovingAverage(data, indicator);
      if (series.length === 0) break;

      const lastValue = series[series.length - 1].value;
      const percentAbove = ((lastClose - lastValue) / lastValue) * 100;

      const isAbove =
        percentAbove >= lowerThresholdPercent &&
        (upperThresholdPercent === Infinity || percentAbove <= upperThresholdPercent);

      if (!isAbove) break;

      matches[`${indicator.type}${indicator.period}`] = Math.round(percentAbove * 100) / 100;
    }

    if (Object.keys(matches).length === indicators.length) {
      result[symbol] = matches;
    }
  }

  return result;
}