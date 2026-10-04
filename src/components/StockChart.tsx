import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  type StockDataPoint,
  type MovingAverageIndicator,
  ALL_MA_INDICATORS,
  maIndicatorKey,
  calcEMA,
  calcSMA,
  getQuoteFromData,
} from "@/lib/stockApi";
import {
  useChartDrawings,
  useCreateChartDrawing,
  useUpdateChartDrawing,
  useDeleteChartDrawing,
  useAlerts,
  useCreatePriceAlert,
} from "@/hooks/useStocks";
import type { DrawingType, ChartDrawing } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MousePointer2, Slash, MoveUpRight, Minus, Magnet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StockChartProps {
  symbol: string;
  data: StockDataPoint[];
}

const MA_COLORS: Record<string, string> = {
  EMA20: "hsl(200, 80%, 50%)",
  EMA50: "hsl(280, 65%, 60%)",
  EMA150: "hsl(150, 60%, 45%)",
  EMA200: "hsl(330, 65%, 55%)",
  SMA150: "hsl(35, 92%, 55%)",
};

const DRAWING_COLOR = "#3b82f6";
const PREVIEW_ID = "__preview__";
const MOVE_THRESHOLD_PX = 3;
const MIN_BAR_SPACING = 2;
const MAX_BAR_SPACING = 100;
const PRICE_PADDING_RATIO = 0.1;
// Reserved right-side column for price-axis labels — keeps them in their own
// lane rather than sharing pixels with candles, MA lines, rays, and marker
// tags that all extend to the data area's own right edge.
const PRICE_AXIS_GUTTER = 56;

interface Point {
  date: string;
  price: number;
}

interface PointSet {
  p1Date: string;
  p1Price: number;
  p2Date: string | null;
  p2Price: number | null;
}

// The canvas engine wants real color strings, not CSS custom properties —
// this reads the app's already-themed HSL variables (index.css) so the chart
// matches the current theme instead of introducing a second palette. Read
// fresh on every draw (not cached), since it has to react to the light/dark
// toggle without a remount.
function cssColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value ? `hsl(${value})` : fallback;
}

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  // Explicit "en-US", not the browser's locale — a Hebrew/Arabic/etc.
  // locale would otherwise localize month names and digit shapes, which
  // doesn't match the rest of this app's English/numeric UI.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// --- View state: owns what range of bars and prices is visible ---
// Logical index model mirrors how lightweight-charts' own "logical range"
// worked (a float index into the data array, increasing left to right) —
// chosen deliberately so findNearestBar's existing Math.round(logical) logic
// above needed no behavior change, only a new source for `logical`.
interface ViewState {
  rightEdgeIndex: number; // logical index at the canvas's right edge
  barSpacing: number; // pixels per bar (the zoom level)
}

interface PriceRange {
  top: number;
  bottom: number;
}

const StockChart: React.FC<StockChartProps> = ({ symbol, data }) => {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ rightEdgeIndex: 0, barSpacing: 10 });
  const priceRangeRef = useRef<PriceRange>({ top: 100, bottom: 0 });
  const didFitRef = useRef(false);
  const panRef = useRef<{ startClientX: number; startRightEdgeIndex: number } | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);

  // --- Dragging an existing drawing's endpoint, or the whole line — state
  // declared early since handleCanvasWheel (below) needs to read dragState ---
  interface DragState {
    drawingId: string;
    mode: "p1" | "p2" | "line";
    original: PointSet;
    startClientX: number;
    startClientY: number;
    originalP1Pixel: { x: number; y: number } | null;
    originalP2Pixel: { x: number; y: number } | null;
  }
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragCurrent, setDragCurrent] = useState<PointSet | null>(null);
  const [dragMoved, setDragMoved] = useState(false);

  // getComputedStyle forces a style recalculation — cheap once per theme
  // toggle, wasteful if re-read on every pan/zoom/resize frame. Resolved
  // once here (useMemo, not an effect — an effect would run one commit
  // after resolvedTheme changes, leaving the first render after a toggle
  // reading stale colors) and read from this everywhere else.
  const themeColors = useMemo(
    () => ({
      border: cssColor("--border", "#333"),
      text: cssColor("--muted-foreground", "#888"),
      up: cssColor("--stock-up", "#22c55e"),
      down: cssColor("--stock-down", "#ef4444"),
      primary: cssColor("--primary", "#22c55e"),
      background: cssColor("--background", "#fff"),
      alertPending: cssColor("--alert-pending", "#f59e0b"),
      alertPendingBg: cssColor("--alert-pending-bg", "#4a3b0e"),
      alertFired: cssColor("--alert-fired", "#22c55e"),
      alertFiredBg: cssColor("--alert-fired-bg", "#0f2a1e"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme]
  );

  const [selectedIndicators, setSelectedIndicators] = useState<MovingAverageIndicator[]>([
    { type: "EMA", period: 20 },
    { type: "EMA", period: 50 },
  ]);

  const [activeTool, setActiveTool] = useState<"cursor" | DrawingType>("cursor");
  const [magnetOn, setMagnetOn] = useState(true);
  const [pendingPoint, setPendingPoint] = useState<Point | null>(null);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [redrawTick, setRedrawTick] = useState(0);

  const { data: drawings = [] } = useChartDrawings(symbol);
  const createDrawing = useCreateChartDrawing();
  const updateDrawing = useUpdateChartDrawing(symbol);
  const deleteDrawing = useDeleteChartDrawing(symbol);

  const { data: allAlerts } = useAlerts();
  const createPriceAlert = useCreatePriceAlert();
  // Only price-target alerts get a chart marker — a moving-average alert's
  // target is itself a moving line, not a fixed price, and already renders
  // as its own MA overlay when that indicator is selected above.
  const symbolAlerts = useMemo(
    () => (allAlerts ?? []).filter((a) => a.symbol === symbol && a.kind === "price" && a.targetPrice != null),
    [allAlerts, symbol]
  );

  const sortedData = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const currentQuote = useMemo(() => getQuoteFromData(sortedData), [sortedData]);
  // Shared date -> array-index lookup — built once per data change instead of
  // re-scanning sortedData with findIndex() on every coordinate conversion.
  const dateToIndex = useMemo(() => new Map(sortedData.map((d, i) => [d.date, i])), [sortedData]);

  const bumpRedraw = useCallback(() => setRedrawTick((n) => n + 1), []);

  // Plot width excludes the reserved price-axis gutter — every x-coordinate
  // tied to data (candles, MA lines, drawings, markers) is computed against
  // this, not the canvas's full width, so nothing collides with axis labels.
  const getPlotWidth = useCallback((): number => {
    const canvas = containerRef.current;
    return Math.max(0, (canvas?.clientWidth ?? 0) - PRICE_AXIS_GUTTER);
  }, []);

  // --- Coordinate <-> (index, price) conversions, driven by viewRef/priceRangeRef ---
  const indexToX = useCallback(
    (index: number): number => {
      const width = getPlotWidth();
      const { rightEdgeIndex, barSpacing } = viewRef.current;
      return width - (rightEdgeIndex - index) * barSpacing;
    },
    [getPlotWidth]
  );

  const xToIndex = useCallback(
    (x: number): number => {
      const width = getPlotWidth();
      const { rightEdgeIndex, barSpacing } = viewRef.current;
      return rightEdgeIndex - (width - x) / barSpacing;
    },
    [getPlotWidth]
  );

  const priceToYRaw = useCallback((price: number): number => {
    const canvas = containerRef.current;
    const height = canvas?.clientHeight ?? 0;
    const { top, bottom } = priceRangeRef.current;
    if (top === bottom) return height / 2;
    return (height * (top - price)) / (top - bottom);
  }, []);

  const yToPrice = useCallback((y: number): number => {
    const canvas = containerRef.current;
    const height = canvas?.clientHeight ?? 0;
    const { top, bottom } = priceRangeRef.current;
    if (height === 0) return top;
    return top - (y / height) * (top - bottom);
  }, []);

  // --- Fit-to-data: whenever the symbol's data changes, show the whole
  // history and let the price range recompute for it — mirrors the old
  // fitContent() + forced autoScale reset (and fixes the same "stuck on the
  // old symbol's price range" bug by construction, since price range is
  // always derived fresh from whatever's visible, never a sticky override).
  useEffect(() => {
    didFitRef.current = false;
  }, [symbol]);

  // --- Resize: keep the canvas's backing resolution in sync with its CSS
  // size (device-pixel-ratio aware, so text/lines stay crisp) ---
  useEffect(() => {
    const canvas = containerRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      bumpRedraw();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [bumpRedraw]);

  // --- Draw loop: canvas 2D, re-run on anything that changes what should be painted ---
  useEffect(() => {
    const canvas = containerRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const plotWidth = getPlotWidth();
    if (width === 0 || height === 0 || sortedData.length === 0) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    // Fit the whole dataset into view the first time this symbol's data
    // arrives (or after a symbol switch resets didFitRef above).
    if (!didFitRef.current) {
      const spacing = Math.min(MAX_BAR_SPACING, Math.max(MIN_BAR_SPACING, plotWidth / sortedData.length));
      viewRef.current = { rightEdgeIndex: sortedData.length - 1, barSpacing: spacing };
      didFitRef.current = true;
    }

    const { rightEdgeIndex, barSpacing } = viewRef.current;
    const visibleBars = plotWidth / barSpacing;
    const firstIndex = Math.max(0, Math.floor(rightEdgeIndex - visibleBars));
    const lastIndex = Math.min(sortedData.length - 1, Math.ceil(rightEdgeIndex));
    const visible = sortedData.slice(firstIndex, lastIndex + 1);

    // Price range auto-fits to whatever's currently visible, always — there
    // is no manual override to get stuck, unlike the old library's autoScale flag.
    let top = -Infinity;
    let bottom = Infinity;
    for (const bar of visible) {
      const hi = bar.high ?? bar.close;
      const lo = bar.low ?? bar.close;
      if (hi > top) top = hi;
      if (lo < bottom) bottom = lo;
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
      top = 100;
      bottom = 0;
    }
    const span = Math.max(top - bottom, 0.01);
    const pad = span * PRICE_PADDING_RATIO;
    priceRangeRef.current = { top: top + pad, bottom: bottom - pad };

    const { border: borderColor, text: textColor, up: upColor, down: downColor } = themeColors;

    ctx.clearRect(0, 0, width, height);
    ctx.font = "11px monospace";
    ctx.lineWidth = 1;

    // Horizontal grid + price axis labels
    const priceTicks = 5;
    ctx.strokeStyle = borderColor;
    ctx.fillStyle = textColor;
    for (let i = 0; i <= priceTicks; i++) {
      const price = priceRangeRef.current.bottom + ((priceRangeRef.current.top - priceRangeRef.current.bottom) * i) / priceTicks;
      const y = priceToYRaw(price);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(price.toFixed(2), plotWidth + 6, y);
    }

    // Vertical grid + time axis labels, spaced ~90px apart
    const tickEvery = Math.max(1, Math.round(90 / barSpacing));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = firstIndex; i <= lastIndex; i += tickEvery) {
      const bar = sortedData[i];
      if (!bar) continue;
      const x = indexToX(i);
      ctx.strokeStyle = borderColor;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText(formatAxisDate(bar.date), x, height - 14);
    }

    // Candles
    const bodyWidth = Math.max(1, barSpacing * 0.6);
    for (let i = firstIndex; i <= lastIndex; i++) {
      const bar = sortedData[i];
      if (!bar) continue;
      const x = indexToX(i);
      const open = bar.open ?? bar.close;
      const close = bar.close;
      const high = bar.high ?? close;
      const low = bar.low ?? close;
      const up = close >= open;
      ctx.strokeStyle = ctx.fillStyle = up ? upColor : downColor;

      ctx.beginPath();
      ctx.moveTo(x, priceToYRaw(high));
      ctx.lineTo(x, priceToYRaw(low));
      ctx.stroke();

      const yOpen = priceToYRaw(open);
      const yClose = priceToYRaw(close);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
      ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    }

    // MA overlays
    for (const indicator of selectedIndicators) {
      const key = maIndicatorKey(indicator);
      const values = indicator.type === "SMA" ? calcSMA(sortedData, indicator.period) : calcEMA(sortedData, indicator.period);
      const byDate = dateToIndex;
      ctx.strokeStyle = MA_COLORS[key];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (const v of values) {
        const idx = byDate.get(v.date);
        if (idx == null) continue;
        const x = indexToX(idx);
        const y = priceToYRaw(v.value);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Crosshair (cursor tool only, not while panning/dragging/placing — those
    // have their own feedback, and a static crosshair sitting on top during
    // a pan would be stale/misleading against the content moving under it).
    if (activeTool === "cursor" && hoverX != null && hoverY != null && !panRef.current && !dragState) {
      ctx.strokeStyle = textColor;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.moveTo(0, hoverY);
      ctx.lineTo(plotWidth, hoverY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Highlighted price readout on the axis, at the exact hovered level —
      // distinct from the plain grid tick labels drawn above.
      const hoverPriceLabel = yToPrice(hoverY).toFixed(2);
      ctx.fillStyle = textColor;
      ctx.fillRect(plotWidth, hoverY - 9, PRICE_AXIS_GUTTER, 18);
      ctx.fillStyle = cssColor("--background", "#fff");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(hoverPriceLabel, plotWidth + 6, hoverY);

      // Highlighted date readout + OHLC readout for the nearest hovered bar.
      const hoveredIndex = Math.round(xToIndex(hoverX));
      const hoveredBar = sortedData[Math.min(Math.max(hoveredIndex, 0), sortedData.length - 1)];
      if (hoveredBar) {
        const dateLabel = formatAxisDate(hoveredBar.date);
        ctx.font = "11px monospace";
        const dateLabelWidth = ctx.measureText(dateLabel).width + 12;
        const dateX = Math.min(Math.max(hoverX - dateLabelWidth / 2, 0), plotWidth - dateLabelWidth);
        ctx.fillStyle = textColor;
        ctx.fillRect(dateX, height - 16, dateLabelWidth, 16);
        ctx.fillStyle = cssColor("--background", "#fff");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(dateLabel, dateX + dateLabelWidth / 2, height - 8);

        const open = hoveredBar.open ?? hoveredBar.close;
        const high = hoveredBar.high ?? hoveredBar.close;
        const low = hoveredBar.low ?? hoveredBar.close;
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(
          `${symbol}  O ${open.toFixed(2)}  H ${high.toFixed(2)}  L ${low.toFixed(2)}  C ${hoveredBar.close.toFixed(2)}  ${hoveredBar.date}`,
          6,
          4
        );
      }
    }
  }, [
    sortedData,
    selectedIndicators,
    themeColors,
    redrawTick,
    hoverX,
    hoverY,
    activeTool,
    indexToX,
    priceToYRaw,
    getPlotWidth,
    dragState,
    xToIndex,
    yToPrice,
    symbol,
    dateToIndex,
  ]);

  const toggleIndicator = (indicator: MovingAverageIndicator) => {
    setSelectedIndicators((prev) =>
      prev.some((i) => maIndicatorKey(i) === maIndicatorKey(indicator))
        ? prev.filter((i) => maIndicatorKey(i) !== maIndicatorKey(indicator))
        : [...prev, indicator]
    );
  };

  // --- Coordinate <-> (date, price) conversions ---
  // Every position is derived from the same container-relative pixel source,
  // so what the mouse points at and what gets rendered can never disagree.
  const findNearestBar = useCallback(
    (x: number): StockDataPoint | null => {
      if (sortedData.length === 0) return null;
      const index = Math.round(xToIndex(x));
      return sortedData[Math.min(Math.max(index, 0), sortedData.length - 1)] ?? null;
    },
    [sortedData, xToIndex]
  );

  const resolveFromPixel = useCallback(
    (x: number, y: number): Point | null => {
      if (sortedData.length === 0) return null;

      if (magnetOn) {
        const bar = findNearestBar(x);
        return bar ? { date: bar.date, price: bar.close } : null;
      }

      // The data is daily bars with no continuous date domain between them —
      // the nearest bar supplies the date even unsnapped; only the price is free.
      const bar = findNearestBar(x);
      if (!bar) return null;
      return { date: bar.date, price: yToPrice(y) };
    },
    [magnetOn, findNearestBar, sortedData, yToPrice]
  );

  const resolvePointFromClientXY = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return resolveFromPixel(clientX - rect.left, clientY - rect.top);
    },
    [resolveFromPixel]
  );

  const toPixel = useCallback(
    (p: Point): { x: number; y: number } | null => {
      const index = dateToIndex.get(p.date);
      if (index == null) return null;
      return { x: indexToX(index), y: priceToYRaw(p.price) };
    },
    [dateToIndex, indexToX, priceToYRaw]
  );

  // A horizontal marker only ever needs a y — a read-only price-level marker
  // (an alert target, the live price) has no reason to depend on a date/x.
  const priceToY = useCallback((price: number): number | null => priceToYRaw(price), [priceToYRaw]);

  // --- Pan (drag) and zoom (wheel) on the canvas itself ---
  // Only ever reaches the canvas when the SVG overlay above isn't capturing
  // pointer events — i.e. cursor tool, and not on top of a selected drawing's
  // own hit-stroke/handles — so no explicit tool-mode guard is needed here.
  // Keeps the view from panning/zooming so far past the data that the chart
  // goes completely blank with no way back short of switching symbols —
  // bounded to the first bar on one side, a half-screen of breathing room
  // past the most recent bar on the other.
  const clampRightEdgeIndex = useCallback(
    (index: number, barSpacing: number): number => {
      if (sortedData.length === 0) return index;
      const visibleBars = getPlotWidth() / barSpacing;
      const min = 0;
      const max = sortedData.length - 1 + visibleBars * 0.5;
      return Math.min(max, Math.max(min, index));
    },
    [sortedData, getPlotWidth]
  );

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // left-button only — right/middle-click shouldn't hijack panning
    panRef.current = { startClientX: e.clientX, startRightEdgeIndex: viewRef.current.rightEdgeIndex };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, []);

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setHoverX(e.clientX - rect.left);
        setHoverY(e.clientY - rect.top);
      }

      if (!panRef.current) return;
      const dx = e.clientX - panRef.current.startClientX;
      const { barSpacing } = viewRef.current;
      viewRef.current = {
        barSpacing,
        rightEdgeIndex: clampRightEdgeIndex(panRef.current.startRightEdgeIndex - dx / barSpacing, barSpacing),
      };
      bumpRedraw();
    },
    [bumpRedraw, clampRightEdgeIndex]
  );

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      panRef.current = null;
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      bumpRedraw(); // re-show the add-alert affordance now that panning has stopped
    },
    [bumpRedraw]
  );

  const handleCanvasPointerLeave = useCallback(() => {
    setHoverX(null);
    setHoverY(null);
  }, []);

  const handleCanvasWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Disabled while dragging an existing line/handle: resolveFromPixel
      // during a drag reconstructs the new point from a pixel baseline
      // frozen at drag-start, so changing barSpacing/rightEdgeIndex mid-drag
      // would make that baseline inconsistent and the line visibly warp.
      if (dragState) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursorX = e.clientX - rect.left;
      const indexUnderCursor = xToIndex(cursorX);
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newBarSpacing = Math.min(MAX_BAR_SPACING, Math.max(MIN_BAR_SPACING, viewRef.current.barSpacing * factor));
      const newRightEdgeIndex = clampRightEdgeIndex(indexUnderCursor + (getPlotWidth() - cursorX) / newBarSpacing, newBarSpacing);
      viewRef.current = { rightEdgeIndex: newRightEdgeIndex, barSpacing: newBarSpacing };
      bumpRedraw();
    },
    [xToIndex, bumpRedraw, getPlotWidth, dragState, clampRightEdgeIndex]
  );

  const handleAddAlertFromHover = useCallback(() => {
    if (hoverY == null || createPriceAlert.isPending) return;
    const price = Math.round(yToPrice(hoverY) * 100) / 100;
    createPriceAlert.mutate(
      { symbol, target_price: price },
      {
        onSuccess: () => toast.success(`Alert set for ${symbol} at $${price.toFixed(2)}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
      }
    );
  }, [hoverY, yToPrice, createPriceAlert, symbol]);

  // --- Placing a new drawing ---
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (activeTool === "cursor") return;
      const point = resolvePointFromClientXY(e.clientX, e.clientY);
      if (!point) return;

      if (activeTool === "horizontal") {
        createDrawing.mutate(
          { symbol, type: "horizontal", p1_date: point.date, p1_price: point.price },
          { onError: (err) => toast.error(err instanceof Error ? err.message : String(err)) }
        );
        return;
      }

      if (!pendingPoint) {
        setPendingPoint(point);
        setPreviewPoint(point);
      } else {
        createDrawing.mutate(
          {
            symbol,
            type: activeTool,
            p1_date: pendingPoint.date,
            p1_price: pendingPoint.price,
            p2_date: point.date,
            p2_price: point.price,
          },
          { onError: (err) => toast.error(err instanceof Error ? err.message : String(err)) }
        );
        setPendingPoint(null);
        setPreviewPoint(null);
      }
    },
    [activeTool, resolvePointFromClientXY, pendingPoint, createDrawing, symbol]
  );

  // --- Dragging an existing drawing's endpoint, or the whole line ---
  const startDrag = useCallback(
    (drawing: ChartDrawing, mode: DragState["mode"], e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const original: PointSet = {
        p1Date: drawing.p1Date,
        p1Price: drawing.p1Price,
        p2Date: drawing.p2Date,
        p2Price: drawing.p2Price,
      };
      setSelectedDrawingId(drawing.id);
      setDragMoved(false);
      setDragState({
        drawingId: drawing.id,
        mode,
        original,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originalP1Pixel: toPixel({ date: original.p1Date, price: original.p1Price }),
        originalP2Pixel: original.p2Date != null && original.p2Price != null ? toPixel({ date: original.p2Date, price: original.p2Price }) : null,
      });
      setDragCurrent(original);
    },
    [toPixel]
  );

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragState) {
        const dx = e.clientX - dragState.startClientX;
        const dy = e.clientY - dragState.startClientY;
        if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) setDragMoved(true);

        if (dragState.mode === "line") {
          const newP1 = dragState.originalP1Pixel ? resolveFromPixel(dragState.originalP1Pixel.x + dx, dragState.originalP1Pixel.y + dy) : null;
          if (!newP1) return;
          const newP2 = dragState.originalP2Pixel ? resolveFromPixel(dragState.originalP2Pixel.x + dx, dragState.originalP2Pixel.y + dy) : null;
          setDragCurrent({
            p1Date: newP1.date,
            p1Price: newP1.price,
            p2Date: newP2 ? newP2.date : dragState.original.p2Date,
            p2Price: newP2 ? newP2.price : dragState.original.p2Price,
          });
          return;
        }

        const point = resolvePointFromClientXY(e.clientX, e.clientY);
        if (!point) return;
        setDragCurrent((prev) => {
          const base = prev ?? dragState.original;
          return dragState.mode === "p1"
            ? { ...base, p1Date: point.date, p1Price: point.price }
            : { ...base, p2Date: point.date, p2Price: point.price };
        });
        return;
      }

      if (activeTool !== "cursor" && pendingPoint) {
        const point = resolvePointFromClientXY(e.clientX, e.clientY);
        if (point) setPreviewPoint(point);
      }
    },
    [dragState, resolveFromPixel, resolvePointFromClientXY, activeTool, pendingPoint]
  );

  const handleOverlayPointerUp = useCallback(() => {
    if (!dragState) return;
    if (dragMoved && dragCurrent) {
      updateDrawing.mutate(
        {
          id: dragState.drawingId,
          p1_date: dragCurrent.p1Date,
          p1_price: dragCurrent.p1Price,
          p2_date: dragCurrent.p2Date,
          p2_price: dragCurrent.p2Price,
        },
        { onError: (err) => toast.error(err instanceof Error ? err.message : String(err)) }
      );
    }
    setDragState(null);
    setDragCurrent(null);
    setDragMoved(false);
  }, [dragState, dragMoved, dragCurrent, updateDrawing]);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedDrawingId) return;
    try {
      await deleteDrawing.mutateAsync(selectedDrawingId);
      setSelectedDrawingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [selectedDrawingId, deleteDrawing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveTool("cursor");
        setPendingPoint(null);
        setPreviewPoint(null);
        setSelectedDrawingId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedDrawingId && !dragState) {
        handleDeleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDrawingId, handleDeleteSelected, dragState]);

  interface RenderLine {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    selected: boolean;
    preview: boolean;
    handles: { x: number; y: number; which: "p1" | "p2" }[];
    drawing: ChartDrawing | null;
  }

  const renderableLines = useMemo((): RenderLine[] => {
    const width = getPlotWidth();
    const lines: RenderLine[] = [];

    const project = (d: PointSet & { type: DrawingType }, id: string, preview: boolean, drawing: ChartDrawing | null) => {
      const p1 = toPixel({ date: d.p1Date, price: d.p1Price });
      if (!p1) return;
      const selected = id === selectedDrawingId;

      if (d.type === "horizontal") {
        lines.push({ id, x1: 0, y1: p1.y, x2: width, y2: p1.y, selected, preview, handles: selected ? [{ x: p1.x, y: p1.y, which: "p1" }] : [], drawing });
        return;
      }

      if (d.p2Date == null || d.p2Price == null) return;
      const p2 = toPixel({ date: d.p2Date, price: d.p2Price });
      if (!p2) return;
      const handles = selected
        ? [
            { x: p1.x, y: p1.y, which: "p1" as const },
            { x: p2.x, y: p2.y, which: "p2" as const },
          ]
        : [];

      if (d.type === "trendline") {
        lines.push({ id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, selected, preview, handles, drawing });
        return;
      }

      // Ray: extend the p1->p2 line to the chart's current right edge.
      if (p2.x === p1.x) {
        lines.push({ id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, selected, preview, handles, drawing });
        return;
      }
      const slope = (p2.y - p1.y) / (p2.x - p1.x);
      const extendedY = p1.y + slope * (width - p1.x);
      lines.push({ id, x1: p1.x, y1: p1.y, x2: width, y2: extendedY, selected, preview, handles, drawing });
    };

    for (const d of drawings) {
      const useDragValues = dragState?.drawingId === d.id && dragCurrent;
      const points = useDragValues ? dragCurrent! : d;
      project({ ...points, type: d.type }, d.id, false, d);
    }

    if (pendingPoint && previewPoint && (activeTool === "trendline" || activeTool === "ray")) {
      project(
        { type: activeTool, p1Date: pendingPoint.date, p1Price: pendingPoint.price, p2Date: previewPoint.date, p2Price: previewPoint.price },
        PREVIEW_ID,
        true,
        null
      );
    }

    return lines;
    // redrawTick intentionally triggers a recompute even though it's not read directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, selectedDrawingId, pendingPoint, previewPoint, activeTool, toPixel, redrawTick, dragState, dragCurrent]);

  interface PriceMarker {
    id: string;
    y: number;
    label: string;
    color: string;
    bgColor: string;
    dashed: boolean;
  }

  // Read-only annotations — current price, and each price-target alert on
  // this symbol. Not draggable/selectable, unlike user drawings above, but
  // repositions on pan/zoom/resize through the same redrawTick-driven recompute.
  const priceMarkers = useMemo((): PriceMarker[] => {
    const markers: PriceMarker[] = [];

    const colors = themeColors;

    if (currentQuote) {
      const y = priceToY(currentQuote.lastPrice);
      if (y != null) {
        markers.push({
          id: "current-price",
          y,
          // "CLOSE", not "LIVE" — this is the latest daily bar's close from
          // the chart's own historical data, not a polled live quote (that's
          // a separate concern — see yahooFinance.ts's getCurrentPrice, which
          // is what actually fires alerts). Labeling it "LIVE" would overstate
          // its freshness.
          label: `${currentQuote.lastPrice.toFixed(2)} CLOSE`,
          // Outlined rather than solid-filled in the line's own color — a
          // solid fill would make the text drawn in that same color vanish.
          color: colors.primary,
          bgColor: colors.background,
          dashed: false,
        });
      }
    }

    for (const alert of symbolAlerts) {
      if (alert.targetPrice == null) continue;
      const y = priceToY(alert.targetPrice);
      if (y == null) continue;
      const fired = alert.status === "triggered";
      markers.push({
        id: `alert-${alert.id}`,
        y,
        label: `${alert.targetPrice.toFixed(2)} ALERT`,
        color: fired ? colors.alertFired : colors.alertPending,
        bgColor: fired ? colors.alertFiredBg : colors.alertPendingBg,
        dashed: !fired,
      });
    }

    return markers;
    // redrawTick intentionally triggers a recompute even though it's not read directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuote, symbolAlerts, priceToY, redrawTick, themeColors]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-foreground font-mono">{symbol}</h3>
        <div className="flex items-center gap-4 flex-wrap">
          {ALL_MA_INDICATORS.map((indicator) => {
            const key = maIndicatorKey(indicator);
            return (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selectedIndicators.some((i) => maIndicatorKey(i) === key)}
                  onCheckedChange={() => toggleIndicator(indicator)}
                />
                <span className="font-mono" style={{ color: MA_COLORS[key] }}>
                  {indicator.type} {indicator.period}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-2">
        <Button
          variant={activeTool === "cursor" ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          title="Cursor"
          onClick={() => {
            setActiveTool("cursor");
            setPendingPoint(null);
            setPreviewPoint(null);
          }}
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button
          variant={activeTool === "trendline" ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          title="Trend Line"
          onClick={() => setActiveTool("trendline")}
        >
          <Slash className="h-4 w-4" />
        </Button>
        <Button
          variant={activeTool === "ray" ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          title="Ray"
          onClick={() => setActiveTool("ray")}
        >
          <MoveUpRight className="h-4 w-4" />
        </Button>
        <Button
          variant={activeTool === "horizontal" ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          title="Horizontal Line"
          onClick={() => setActiveTool("horizontal")}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant={magnetOn ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          title="Magnet: snap to each bar's close price"
          onClick={() => setMagnetOn((v) => !v)}
        >
          <Magnet className="h-4 w-4" />
        </Button>
        {selectedDrawingId && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            title="Delete selected drawing"
            onClick={handleDeleteSelected}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        className="relative"
        style={{ height: 400, touchAction: "none" }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={handleCanvasPointerLeave}
        onWheel={handleCanvasWheel}
      >
        <canvas
          ref={containerRef}
          className="absolute inset-0"
          style={{ width: "100%", height: "100%", cursor: activeTool === "cursor" ? "grab" : "default" }}
        />
        <svg
          className="absolute inset-0"
          style={{ width: "100%", height: "100%", zIndex: 10, pointerEvents: activeTool === "cursor" ? "none" : "all" }}
          onClick={handleOverlayClick}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
        >
          {renderableLines.map((line) => (
            <g key={line.id}>
              {!line.preview && line.drawing && activeTool === "cursor" && (
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="transparent"
                  strokeWidth={10}
                  style={{ pointerEvents: "auto", cursor: "move" }}
                  onPointerDown={(e) => startDrag(line.drawing!, "line", e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDrawingId(line.id);
                  }}
                />
              )}
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.selected ? "hsl(var(--primary))" : DRAWING_COLOR}
                strokeWidth={line.selected ? 2.5 : 1.5}
                strokeDasharray={line.preview ? "5 5" : undefined}
                className={cn(line.preview && "opacity-70")}
                style={{ pointerEvents: "none" }}
              />
              {line.handles.map((h) => (
                <circle
                  key={h.which}
                  cx={h.x}
                  cy={h.y}
                  r={5}
                  fill="hsl(var(--background))"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  style={{ pointerEvents: activeTool === "cursor" ? "auto" : "none", cursor: "move" }}
                  onPointerDown={(e) => line.drawing && startDrag(line.drawing, h.which, e)}
                />
              ))}
            </g>
          ))}
          {priceMarkers.map((marker) => {
            const width = getPlotWidth();
            const tagWidth = marker.label.length * 6.5 + 12;
            return (
              <g key={marker.id} style={{ pointerEvents: "none" }}>
                <line
                  x1={0}
                  y1={marker.y}
                  x2={width}
                  y2={marker.y}
                  stroke={marker.color}
                  strokeWidth={1.5}
                  strokeDasharray={marker.dashed ? "4 4" : undefined}
                />
                <rect
                  x={width - tagWidth - 2}
                  y={marker.y - 9}
                  width={tagWidth}
                  height={18}
                  rx={3}
                  fill={marker.bgColor}
                  stroke={marker.color}
                  strokeWidth={1}
                />
                <text
                  x={width - tagWidth / 2 - 2}
                  y={marker.y + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="monospace"
                  fontWeight={600}
                  fill={marker.color}
                >
                  {marker.label}
                </text>
              </g>
            );
          })}
          {activeTool === "cursor" && hoverY != null && !panRef.current && !dragState && (() => {
            const plotWidth = getPlotWidth();
            const hoverPrice = yToPrice(hoverY);
            const buttonX = plotWidth + PRICE_AXIS_GUTTER / 2;
            return (
              <g key="add-alert-affordance">
                {/* Neutral, dashed, and never colored like a real alert marker — this is only a "place one here?" affordance. */}
                <line
                  x1={0}
                  y1={hoverY}
                  x2={plotWidth}
                  y2={hoverY}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  style={{ pointerEvents: "none" }}
                />
                <g
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddAlertFromHover();
                  }}
                >
                  <title>{`Add alert at $${hoverPrice.toFixed(2)}`}</title>
                  <circle cx={buttonX} cy={hoverY} r={10} fill="hsl(var(--primary))" />
                  <line x1={buttonX - 4} y1={hoverY} x2={buttonX + 4} y2={hoverY} stroke="hsl(var(--primary-foreground))" strokeWidth={1.5} />
                  <line x1={buttonX} y1={hoverY - 4} x2={buttonX} y2={hoverY + 4} stroke="hsl(var(--primary-foreground))" strokeWidth={1.5} />
                </g>
              </g>
            );
          })()}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {activeTool === "cursor"
          ? "Drag to pan, scroll to zoom. Click a line to select it, drag it or its endpoints to move it, Delete/Backspace to remove."
          : "Click to place points. Escape cancels."}
      </p>
    </div>
  );
};

export default StockChart;
