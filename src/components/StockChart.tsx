import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import {
  type StockDataPoint,
  type MovingAverageIndicator,
  ALL_MA_INDICATORS,
  maIndicatorKey,
  calcEMA,
  calcSMA,
} from "@/lib/stockApi";
import { useChartDrawings, useCreateChartDrawing, useUpdateChartDrawing, useDeleteChartDrawing } from "@/hooks/useStocks";
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

// lightweight-charts wants real color strings, not CSS custom properties —
// this reads the app's already-themed HSL variables (index.css) at chart
// creation time so the chart matches the current theme instead of introducing
// a second, separately-maintained color palette.
function cssColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value ? `hsl(${value})` : fallback;
}

const StockChart: React.FC<StockChartProps> = ({ symbol, data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const maSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

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

  const sortedData = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);

  const bumpRedraw = useCallback(() => setRedrawTick((n) => n + 1), []);

  // --- Chart lifecycle: created once, torn down on unmount ---
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssColor("--muted-foreground", "#888"),
      },
      grid: {
        vertLines: { color: cssColor("--border", "#333") },
        horzLines: { color: cssColor("--border", "#333") },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: cssColor("--border", "#333") },
      timeScale: { borderColor: cssColor("--border", "#333") },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: cssColor("--stock-up", "#22c55e"),
      downColor: cssColor("--stock-down", "#ef4444"),
      borderVisible: false,
      wickUpColor: cssColor("--stock-up", "#22c55e"),
      wickDownColor: cssColor("--stock-down", "#ef4444"),
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    chart.timeScale().subscribeVisibleLogicalRangeChange(bumpRedraw);
    const resizeObserver = new ResizeObserver(bumpRedraw);
    resizeObserver.observe(containerRef.current);
    const maSeries = maSeriesRef.current;

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      maSeries.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Feed candlestick data ---
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.setData(
      sortedData.map((p) => ({
        time: p.date,
        open: p.open ?? p.close,
        high: p.high ?? p.close,
        low: p.low ?? p.close,
        close: p.close,
      }))
    );
    // A manual drag/zoom on the price axis latches autoScale off in
    // lightweight-charts, which otherwise leaves a newly-loaded symbol
    // (e.g. switching from a ~$100 stock to a ~$5 one) rendered at the old
    // symbol's price range. Force it back on whenever the data changes so a
    // new symbol always starts fully fit to its own range.
    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    chartRef.current?.timeScale().fitContent();
    bumpRedraw();
  }, [sortedData, bumpRedraw]);

  // --- Moving-average overlay series: add/remove as the checkboxes change ---
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const wantedKeys = new Set(selectedIndicators.map(maIndicatorKey));

    for (const [key, series] of maSeriesRef.current) {
      if (!wantedKeys.has(key)) {
        chart.removeSeries(series);
        maSeriesRef.current.delete(key);
      }
    }

    for (const indicator of selectedIndicators) {
      const key = maIndicatorKey(indicator);
      const values = indicator.type === "SMA" ? calcSMA(sortedData, indicator.period) : calcEMA(sortedData, indicator.period);
      let series = maSeriesRef.current.get(key);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: MA_COLORS[key],
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        maSeriesRef.current.set(key, series);
      }
      series.setData(values.map((v) => ({ time: v.date, value: v.value })));
    }
  }, [selectedIndicators, sortedData]);

  const toggleIndicator = (indicator: MovingAverageIndicator) => {
    setSelectedIndicators((prev) =>
      prev.some((i) => maIndicatorKey(i) === maIndicatorKey(indicator))
        ? prev.filter((i) => maIndicatorKey(i) !== maIndicatorKey(indicator))
        : [...prev, indicator]
    );
  };

  // --- Coordinate <-> (date, price) conversions ---
  // Deliberately NOT using lightweight-charts' own subscribeClick/subscribeCrosshairMove
  // for placing/dragging drawings — every position here is derived from the
  // same source (the container's own bounding box), so what the mouse points
  // at and what gets rendered can never disagree with each other.
  const findNearestBar = useCallback(
    (x: number): StockDataPoint | null => {
      if (!chartRef.current || sortedData.length === 0) return null;
      const logical = chartRef.current.timeScale().coordinateToLogical(x);
      if (logical == null) return null;
      const index = Math.round(logical);
      return sortedData[Math.min(Math.max(index, 0), sortedData.length - 1)] ?? null;
    },
    [sortedData]
  );

  const resolveFromPixel = useCallback(
    (x: number, y: number): Point | null => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      if (!chart || !series) return null;

      if (magnetOn) {
        const bar = findNearestBar(x);
        return bar ? { date: bar.date, price: bar.close } : null;
      }

      const time = chart.timeScale().coordinateToTime(x);
      const price = series.coordinateToPrice(y);
      if (time == null || price == null) return null;
      return { date: String(time), price };
    },
    [magnetOn, findNearestBar]
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

  const toPixel = useCallback((p: Point): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(p.date as Time);
    const y = series.priceToCoordinate(p.price);
    if (x == null || y == null) return null;
    return { x, y };
  }, []);

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
    const width = containerRef.current?.clientWidth ?? 0;
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

      <div className="relative" style={{ height: 400 }}>
        <div ref={containerRef} className="absolute inset-0" />
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
        </svg>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {activeTool === "cursor"
          ? "Click a line to select it, drag it or its endpoints to move it, Delete/Backspace to remove."
          : "Click to place points. Escape cancels."}
      </p>
    </div>
  );
};

export default StockChart;
