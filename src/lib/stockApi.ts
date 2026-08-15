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

export const ALL_MA_INDICATORS: MovingAverageIndicator[] = [
  { type: "EMA", period: 20 },
  { type: "EMA", period: 50 },
  { type: "EMA", period: 150 },
  { type: "EMA", period: 200 },
  { type: "SMA", period: 150 },
];

export function maIndicatorKey(indicator: MovingAverageIndicator) {
  return `${indicator.type}${indicator.period}`;
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

export const FIB_LEVELS = [23.6, 38.2, 50, 61.8, 78.6, 100] as const;
export type FibLevel = (typeof FIB_LEVELS)[number];

interface FibSwing {
  low: number;
  high: number;
}

// Uses UTC calendar fields throughout: `StockDataPoint.date` is a "YYYY-MM-DD"
// string, which `new Date(...)` always parses as UTC midnight. Mutating with
// local-time methods (setMonth/getMonth) would silently shift the result by a
// day near month boundaries depending on the machine's timezone offset.
function subtractMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, date.getUTCDate()));
}

/**
 * Finds the "bottom" for a Fibonacci retracement: starting at the most
 * recent point, checks whether anything in the 6 calendar months right
 * before it is lower. If so, that lower point becomes the new candidate and
 * the same 6-month check repeats from there — walking backward until a
 * candidate is found with nothing lower behind it (a confirmed low), or
 * until the available data runs out.
 */
function findFibBottomIndex(data: StockDataPoint[]): number {
  let bottomIndex = data.length - 1;

  while (true) {
    const windowStart = subtractMonths(new Date(data[bottomIndex].date), 6);
    const currentLow = data[bottomIndex].low ?? data[bottomIndex].close;

    let lowerIndex = -1;
    let lowerValue = currentLow;

    for (let i = 0; i < bottomIndex; i++) {
      if (new Date(data[i].date) < windowStart) continue;
      const candidate = data[i].low ?? data[i].close;
      if (candidate < lowerValue) {
        lowerValue = candidate;
        lowerIndex = i;
      }
    }

    if (lowerIndex === -1) return bottomIndex; // nothing lower in the preceding 6 months
    bottomIndex = lowerIndex;
  }
}

/**
 * Finds the swing used for a Fibonacci retracement: the confirmed bottom
 * (see findFibBottomIndex), then the highest high among the points that
 * come after it chronologically (the "top" of the move up off that bottom).
 * Returns null if the bottom is the last point (no subsequent high to swing to).
 */
function findFibSwing(data: StockDataPoint[]): FibSwing | null {
  if (data.length === 0) return null;

  const bottomIndex = findFibBottomIndex(data);
  const low = data[bottomIndex].low ?? data[bottomIndex].close;

  if (bottomIndex >= data.length - 1) return null;

  let high = data[bottomIndex + 1].high ?? data[bottomIndex + 1].close;
  for (let i = bottomIndex + 2; i < data.length; i++) {
    const candidate = data[i].high ?? data[i].close;
    if (candidate > high) high = candidate;
  }

  return { low, high };
}

export interface FibLevelResult {
  low: number;
  high: number;
  levelPrice: number;
  percentFromLevel: number;
}

export function calcFibRetracement(data: StockDataPoint[], levelPercent: number): FibLevelResult | null {
  const swing = findFibSwing(data);
  if (!swing) return null;

  const levelPrice = swing.high - (swing.high - swing.low) * (levelPercent / 100);
  const lastClose = data[data.length - 1].close;
  const percentFromLevel = ((lastClose - levelPrice) / levelPrice) * 100;

  return {
    low: swing.low,
    high: swing.high,
    levelPrice: Math.round(levelPrice * 100) / 100,
    percentFromLevel: Math.round(percentFromLevel * 100) / 100,
  };
}

export function checkStocksNearFib(
  stocksData: Record<string, StockDataPoint[]>,
  levelPercent: number,
  lowerThresholdPercent: number = 0,
  upperThresholdPercent: number = Infinity
): Record<string, FibLevelResult> {
  const result: Record<string, FibLevelResult> = {};

  for (const [symbol, data] of Object.entries(stocksData)) {
    if (!Array.isArray(data) || data.length === 0) continue;

    const fib = calcFibRetracement(data, levelPercent);
    if (!fib) continue;

    const isNear =
      fib.percentFromLevel >= lowerThresholdPercent &&
      (upperThresholdPercent === Infinity || fib.percentFromLevel <= upperThresholdPercent);

    if (isNear) {
      result[symbol] = fib;
    }
  }

  return result;
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

export interface CombinedScreenResult {
  maMatches: Record<string, number>;
  fib?: FibLevelResult;
}

/**
 * Combines the moving-average screen and the Fibonacci screen into a single
 * AND across everything selected: a symbol only qualifies if every chosen
 * MA indicator AND (when picked) the chosen Fib level all fall within the
 * shared threshold range. Selecting nothing of one kind simply skips that
 * check, so callers can mix "MA only", "Fib only", or both.
 */
export function checkStocksCombined(
  stocksData: Record<string, StockDataPoint[]>,
  indicators: MovingAverageIndicator[],
  fibLevel: FibLevel | null,
  lowerThresholdPercent: number = 0,
  upperThresholdPercent: number = Infinity
): Record<string, CombinedScreenResult> {
  const result: Record<string, CombinedScreenResult> = {};

  const withinThreshold = (percent: number) =>
    percent >= lowerThresholdPercent && (upperThresholdPercent === Infinity || percent <= upperThresholdPercent);

  for (const [symbol, data] of Object.entries(stocksData)) {
    if (!Array.isArray(data) || data.length === 0) continue;

    const lastClose = data[data.length - 1].close;
    const maMatches: Record<string, number> = {};
    let maAllMatch = true;

    for (const indicator of indicators) {
      const series = calcMovingAverage(data, indicator);
      if (series.length === 0) {
        maAllMatch = false;
        break;
      }

      const lastValue = series[series.length - 1].value;
      const percentAbove = ((lastClose - lastValue) / lastValue) * 100;

      if (!withinThreshold(percentAbove)) {
        maAllMatch = false;
        break;
      }

      maMatches[maIndicatorKey(indicator)] = Math.round(percentAbove * 100) / 100;
    }

    if (!maAllMatch || Object.keys(maMatches).length !== indicators.length) continue;

    let fib: FibLevelResult | undefined;
    if (fibLevel != null) {
      const fibResult = calcFibRetracement(data, fibLevel);
      if (!fibResult || !withinThreshold(fibResult.percentFromLevel)) continue;
      fib = fibResult;
    }

    result[symbol] = { maMatches, fib };
  }

  return result;
}