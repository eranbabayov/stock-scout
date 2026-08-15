import React, { useState } from "react";
import {
  type StockDataPoint,
  type MovingAverageIndicator,
  ALL_MA_INDICATORS,
  maIndicatorKey,
  checkStocksAboveAvg,
} from "@/lib/stockApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";

interface StocksAboveAvgProps {
  stocksData: Record<string, StockDataPoint[]>;
}

const StocksAboveAvg: React.FC<StocksAboveAvgProps> = ({ stocksData }) => {
  const [selectedIndicators, setSelectedIndicators] = useState<MovingAverageIndicator[]>([
    { type: "EMA", period: 150 },
  ]);
  const [results, setResults] = useState<Record<string, Record<string, number>> | null>(null);
  const [lowerThreshold, setLowerThreshold] = useState<number>(0);
  const [upperThreshold, setUpperThreshold] = useState<number>(50);

  const toggleIndicator = (indicator: MovingAverageIndicator) => {
    setSelectedIndicators((prev) =>
      prev.some((i) => maIndicatorKey(i) === maIndicatorKey(indicator))
        ? prev.filter((i) => maIndicatorKey(i) !== maIndicatorKey(indicator))
        : [...prev, indicator]
    );
  };

  const analyze = () => {
    const res = checkStocksAboveAvg(stocksData, selectedIndicators, lowerThreshold, upperThreshold);
    setResults(res);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Stocks Above Moving Averages</h3>
      </div>

      {/* Indicator checkboxes */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {ALL_MA_INDICATORS.map((indicator) => (
          <label key={maIndicatorKey(indicator)} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={selectedIndicators.some((i) => maIndicatorKey(i) === maIndicatorKey(indicator))}
              onCheckedChange={() => toggleIndicator(indicator)}
            />
            <span className="font-mono text-foreground">
              {indicator.type} {indicator.period}
            </span>
          </label>
        ))}
      </div>

      {/* Threshold controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Min % above:</span>
          <input
            type="number"
            min={0}
            value={lowerThreshold}
            onChange={(e) => setLowerThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Max % above:</span>
          <input
            type="number"
            min={0}
            value={upperThreshold}
            onChange={(e) => setUpperThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <Button onClick={analyze} size="sm" disabled={selectedIndicators.length === 0}>
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
            Object.entries(results).map(([symbol, matches]) => (
              <div
                key={symbol}
                className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 flex-wrap"
              >
                <span className="font-mono font-bold text-foreground w-16">{symbol}</span>
                {Object.entries(matches).map(([key, pct]) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="font-mono text-xs flex items-center gap-1"
                  >
                    {key.replace(/(\d+)$/, " $1")} ✓
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
