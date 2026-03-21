import React, { useMemo, useState } from "react";
import { type StockDataPoint, calcEMA } from "@/lib/stockApi";
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

const MA_COLORS: Record<number, string> = {
  20: "hsl(200, 80%, 50%)",
  50: "hsl(280, 65%, 60%)",
  150: "hsl(35, 92%, 55%)",
  200: "hsl(330, 65%, 55%)",
};

const StockChart: React.FC<StockChartProps> = ({ symbol, data }) => {
  const [selectedMAs, setSelectedMAs] = useState<number[]>([20, 50]);

  const chartData = useMemo(() => {
    const emas: Record<number, { date: string; value: number }[]> = {};
    for (const period of [20, 50, 150, 200]) {
      emas[period] = calcEMA(data, period);
    }

    return data.map((point, i) => {
      const row: Record<string, any> = {
        date: point.date,
        close: point.close,
      };
      for (const period of [20, 50, 150, 200]) {
        row[`ema${period}`] = emas[period][i]?.value ?? null;
      }
      return row;
    });
  }, [data]);

  const toggleMA = (period: number) => {
    setSelectedMAs((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-foreground font-mono">{symbol} — 1 Year Chart</h3>
        <div className="flex items-center gap-4 flex-wrap">
          {[20, 50, 150, 200].map((period) => (
            <label key={period} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selectedMAs.includes(period)}
                onCheckedChange={() => toggleMA(period)}
              />
              <span className="font-mono" style={{ color: MA_COLORS[period] }}>
                EMA {period}
              </span>
            </label>
          ))}
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
          {selectedMAs.map((period) => (
            <Line
              key={period}
              type="monotone"
              dataKey={`ema${period}`}
              stroke={MA_COLORS[period]}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="5 5"
              name={`EMA ${period}`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;
