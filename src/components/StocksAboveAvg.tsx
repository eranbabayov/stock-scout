import React, { useState } from "react";
import { type StockDataPoint, checkStocksAboveAvg } from "@/lib/stockApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";

interface StocksAboveAvgProps {
  stocksData: Record<string, StockDataPoint[]>;
}

const ALL_PERIODS = [20, 50, 150, 200];

const StocksAboveAvg: React.FC<StocksAboveAvgProps> = ({ stocksData }) => {
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>([150]);
  const [results, setResults] = useState<Record<string, Record<string, number>> | null>(null);
  const [lowerThreshold, setLowerThreshold] = useState<number>(0);
  const [upperThreshold, setUpperThreshold] = useState<number>(50);

  const togglePeriod = (period: number) => {
    setSelectedPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
    );
  };

  const analyze = () => {
    const res = checkStocksAboveAvg(stocksData, selectedPeriods, lowerThreshold, upperThreshold);
    setResults(res);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Stocks Above Moving Averages</h3>
      </div>

      {/* Period checkboxes */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {ALL_PERIODS.map((period) => (
          <label key={period} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={selectedPeriods.includes(period)}
              onCheckedChange={() => togglePeriod(period)}
            />
            <span className="font-mono text-foreground">EMA {period}</span>
          </label>
        ))}
      </div>

      {/* Threshold controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Min % above EMA:</span>
          <input
            type="number"
            min={0}
            value={lowerThreshold}
            onChange={(e) => setLowerThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Max % above EMA:</span>
          <input
            type="number"
            min={0}
            value={upperThreshold}
            onChange={(e) => setUpperThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <Button onClick={analyze} size="sm" disabled={selectedPeriods.length === 0}>
          Analyze
        </Button>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="space-y-2">
          {Object.keys(results).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stocks found above selected moving averages within the threshold.
            </p>
          ) : (
            Object.entries(results).map(([symbol, periods]) => (
              <div
                key={symbol}
                className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 flex-wrap"
              >
                <span className="font-mono font-bold text-foreground w-16">{symbol}</span>
                {Object.entries(periods).map(([p, pct]) => (
                  <Badge
                    key={p}
                    variant="secondary"
                    className="font-mono text-xs flex items-center gap-1"
                  >
                    EMA {p} ✓
                    <span className="text-green-500">+{pct}% above</span>
                  </Badge>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default StocksAboveAvg;
