import { apiFetch } from "@/lib/apiClient";

export type {
  StockDataPoint,
  MovingAverageType,
  MovingAverageIndicator,
  FibLevel,
  FibLevelResult,
  CombinedScreenResult,
} from "../../shared/screener";

export {
  calcEMA,
  calcSMA,
  ALL_MA_INDICATORS,
  maIndicatorKey,
  FIB_LEVELS,
  calcFibRetracement,
  checkStocksNearFib,
  checkStocksAboveAvg,
  checkStocksCombined,
} from "../../shared/screener";

import type { StockDataPoint } from "../../shared/screener";

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
