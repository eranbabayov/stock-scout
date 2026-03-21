import React from "react";
import { getQuoteFromData, type StockDataPoint } from "@/lib/stockApi";
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WatchlistCardProps {
  symbol: string;
  data: StockDataPoint[];
  onRemove: (symbol: string) => void;
  onSelect: (symbol: string) => void;
  selected: boolean;
  removing: boolean;
}

const WatchlistCard: React.FC<WatchlistCardProps> = ({ symbol, data, onRemove, onSelect, selected, removing }) => {
  const quote = getQuoteFromData(data);
  const isUp = quote ? quote.change > 0 : false;
  const isDown = quote ? quote.change < 0 : false;

  return (
    <div
      onClick={() => onSelect(symbol)}
      className={`stock-card cursor-pointer relative group ${selected ? "ring-2 ring-primary border-primary" : ""}`}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}
        disabled={removing}
      >
        <X className="h-3 w-3" />
      </Button>

      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-bold text-foreground">{symbol}</span>
        {isUp && <TrendingUp className="h-4 w-4 text-stock-up" />}
        {isDown && <TrendingDown className="h-4 w-4 text-stock-down" />}
        {!isUp && !isDown && <Minus className="h-4 w-4 text-stock-neutral" />}
      </div>

      {quote ? (
        <>
          <div className="text-xl font-mono font-semibold text-foreground">
            ${quote.lastPrice.toFixed(2)}
          </div>
          <div className={`text-sm font-mono ${isUp ? "price-up" : isDown ? "price-down" : "price-neutral"}`}>
            {isUp ? "+" : ""}{quote.change.toFixed(2)} ({isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%)
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
    </div>
  );
};

export default WatchlistCard;
