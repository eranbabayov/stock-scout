import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase.functions.invoke("fetch-stock-data", {
    body: { symbols, period: "1y" },
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function validateStock(symbol: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("validate-stock", {
    body: { symbol },
  });

  if (error) return false;
  return data?.valid ?? false;
}

export function calcEMA(data: StockDataPoint[], period: number): { date: string; value: number }[] {
  if (data.length === 0) return [];

  const alpha = 2 / (period + 1);
  const result: { date: string; value: number }[] = [];
  let previousEma = data[0].close;

  for (const point of data) {
    previousEma = alpha * point.close + (1 - alpha) * previousEma;
    result.push({ date: point.date, value: Math.round(previousEma * 100) / 100 });
  }

  return result;
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
  avgPeriods: number[],
  thresholdPercent: number = 2
): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};

  for (const [symbol, data] of Object.entries(stocksData)) {
    if (!Array.isArray(data) || data.length === 0) continue;

    const lastClose = data[data.length - 1].close;
    let allMatch = true;
    const matches: Record<string, boolean> = {};

    for (const period of avgPeriods) {
      const ema = calcEMA(data, period);
      if (ema.length === 0) { allMatch = false; break; }
      const lastEma = ema[ema.length - 1].value;
      const isAbove = lastClose > lastEma && lastClose < lastEma * (1 + thresholdPercent / 100);
      matches[String(period)] = isAbove;
      if (!isAbove) { allMatch = false; break; }
    }

    if (allMatch && Object.keys(matches).length > 0) {
      result[symbol] = matches;
    }
  }

  return result;
}
