import React, { useMemo, useState } from "react";
import {
  type StockDataPoint,
  type MovingAverageIndicator,
  ALL_MA_INDICATORS,
  maIndicatorKey,
  calcEMA,
  calcSMA,
} from "@/lib/stockApi";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Checkbox } from "@/components/ui/checkbox";

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

const StockChart: React.FC<StockChartProps> = ({ symbol, data }) => {
  const [selectedIndicators, setSelectedIndicators] = useState<MovingAverageIndicator[]>([
    { type: "EMA", period: 20 },
    { type: "EMA", period: 50 },
  ]);

  const chartData = useMemo(() => {
    const series: Record<string, { date: string; value: number }[]> = {};
    for (const indicator of ALL_MA_INDICATORS) {
      const key = maIndicatorKey(indicator);
      series[key] = indicator.type === "SMA" ? calcSMA(data, indicator.period) : calcEMA(data, indicator.period);
    }

    return data.map((point, i) => {
      const row: Record<string, string | number | null> = {
        date: point.date,
        close: point.close,
      };
      for (const indicator of ALL_MA_INDICATORS) {
        const key = maIndicatorKey(indicator);
        row[key] = series[key][i]?.value ?? null;
      }
      return row;
    });
  }, [data]);

  const toggleIndicator = (indicator: MovingAverageIndicator) => {
    setSelectedIndicators((prev) =>
      prev.some((i) => maIndicatorKey(i) === maIndicatorKey(indicator))
        ? prev.filter((i) => maIndicatorKey(i) !== maIndicatorKey(indicator))
        : [...prev, indicator]
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-foreground font-mono">{symbol} — 1 Year Chart</h3>
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

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tickFormatter={(val) => {
              const d = new Date(val);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(val) => `$${val}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
            formatter={(value: number) => [`$${value.toFixed(2)}`]}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            name="Close"
          />
          {selectedIndicators.map((indicator) => {
            const key = maIndicatorKey(indicator);
            return (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={MA_COLORS[key]}
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="5 5"
                name={`${indicator.type} ${indicator.period}`}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;
