import React, { useMemo, useState } from "react";
import { useUserTrades, useAddTrade, useUpdateTrade, useDeleteTrade } from "@/hooks/useStocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SymbolAutocomplete from "@/components/SymbolAutocomplete";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Trash2, Pencil, Plus, BookOpen, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { validateStock } from "@/lib/stockApi";
import type { UserTrade } from "@/lib/types";

type DateFilterPreset = "all" | "week" | "month" | "custom";

function getTotalHold(trade: UserTrade): number {
  return Math.round(trade.buyPrice * trade.quantity * 100) / 100;
}

function getPnL(trade: UserTrade) {
  if (trade.sellPrice == null) return null;
  // P&L is always derived from quantity and buy price (the cost basis), never
  // just the per-share price move, so it reflects the real dollar outcome.
  const perShare = trade.direction === "short" ? trade.buyPrice - trade.sellPrice : trade.sellPrice - trade.buyPrice;
  const pnl = perShare * trade.quantity;
  const pnlPercent = (perShare / trade.buyPrice) * 100;
  return { pnl: Math.round(pnl * 100) / 100, pnlPercent: Math.round(pnlPercent * 100) / 100 };
}

function startOfPresetRange(preset: "week" | "month"): string {
  const now = new Date();
  if (preset === "week") now.setDate(now.getDate() - 7);
  else now.setMonth(now.getMonth() - 1);
  return now.toISOString().split("T")[0];
}

function tradesToCsv(trades: UserTrade[]): string {
  const headers = [
    "Symbol",
    "Direction",
    "Quantity",
    "Buy Price",
    "Total Hold",
    "Buy Date",
    "Sell Price",
    "Sell Date",
    "P&L ($)",
    "P&L (%)",
    "Notes",
  ];

  const escape = (value: string | number | null | undefined) => {
    const str = value == null ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const rows = trades.map((trade) => {
    const pnl = getPnL(trade);
    return [
      trade.symbol,
      trade.direction,
      trade.quantity,
      trade.buyPrice,
      getTotalHold(trade),
      trade.buyDate,
      trade.sellPrice ?? "",
      trade.sellDate ?? "",
      pnl?.pnl ?? "",
      pnl?.pnlPercent ?? "",
      trade.notes ?? "",
    ]
      .map(escape)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const TradesPanel: React.FC = () => {
  const { data: trades, isLoading } = useUserTrades();
  const addTrade = useAddTrade();
  const updateTrade = useUpdateTrade();
  const deleteTrade = useDeleteTrade();

  const emptyForm = {
    symbol: "",
    direction: "long" as "long" | "short",
    quantity: "",
    buy_price: "",
    buy_date: "",
    sell_price: "",
    sell_date: "",
    notes: "",
  };

  const [showForm, setShowForm] = useState(false);
  const [validatingSymbol, setValidatingSymbol] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const filteredTrades = useMemo(() => {
    if (!trades) return [];
    if (datePreset === "all") return trades;

    let start = "";
    let end = "";
    if (datePreset === "week") start = startOfPresetRange("week");
    else if (datePreset === "month") start = startOfPresetRange("month");
    else {
      start = customStart;
      end = customEnd;
    }

    return trades.filter((trade) => {
      if (start && trade.buyDate < start) return false;
      if (end && trade.buyDate > end) return false;
      return true;
    });
  }, [trades, datePreset, customStart, customEnd]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      try {
        await updateTrade.mutateAsync({
          id: editingId,
          direction: form.direction,
          quantity: parseFloat(form.quantity),
          buy_price: parseFloat(form.buy_price),
          buy_date: form.buy_date,
          sell_price: form.sell_price ? parseFloat(form.sell_price) : null,
          sell_date: form.sell_date || null,
          notes: form.notes || null,
        });
        toast.success("Trade updated");
        setForm(emptyForm);
        setEditingId(null);
        setShowForm(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol) return;

    setValidatingSymbol(true);
    const valid = await validateStock(symbol);
    setValidatingSymbol(false);

    if (!valid) {
      toast.error(`"${symbol}" is not a valid stock symbol`);
      return;
    }

    try {
      await addTrade.mutateAsync({
        symbol,
        direction: form.direction,
        quantity: parseFloat(form.quantity),
        buy_price: parseFloat(form.buy_price),
        buy_date: form.buy_date,
        sell_price: form.sell_price ? parseFloat(form.sell_price) : undefined,
        sell_date: form.sell_date || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Trade added");
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleEdit = (trade: UserTrade) => {
    setEditingId(trade.id);
    setForm({
      symbol: trade.symbol,
      direction: trade.direction as "long" | "short",
      quantity: String(trade.quantity),
      buy_price: String(trade.buyPrice),
      buy_date: trade.buyDate,
      sell_price: trade.sellPrice != null ? String(trade.sellPrice) : "",
      sell_date: trade.sellDate ?? "",
      notes: trade.notes ?? "",
    });
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrade.mutateAsync(id);
      toast.success("Trade removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExport = () => {
    if (filteredTrades.length === 0) {
      toast.error("No trades to export");
      return;
    }
    downloadCsv(`trades-${new Date().toISOString().split("T")[0]}.csv`, tradesToCsv(filteredTrades));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Trade Journal</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Trade
          </Button>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && handleCancelForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? `Edit ${form.symbol} Trade` : "Add Trade"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Symbol can't be changed — update the rest of the trade's details below."
                : "Record a new long or short position in your trade journal."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="trade-symbol">Symbol</Label>
              {editingId ? (
                <Input id="trade-symbol" value={form.symbol} required className="font-mono" disabled />
              ) : (
                <SymbolAutocomplete
                  id="trade-symbol"
                  placeholder="AAPL"
                  value={form.symbol}
                  onChange={(symbol) => setForm({ ...form, symbol })}
                  required
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trade-direction">Direction</Label>
              <Select
                value={form.direction}
                onValueChange={(value) => setForm({ ...form, direction: value as "long" | "short" })}
              >
                <SelectTrigger id="trade-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trade-quantity">Position Amount (shares)</Label>
              <Input
                id="trade-quantity"
                type="number"
                step="1"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trade-buy-price">Buy Price</Label>
              <Input
                id="trade-buy-price"
                type="number"
                step="0.01"
                value={form.buy_price}
                onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trade-buy-date">Buy Date</Label>
              <Input
                id="trade-buy-date"
                type="date"
                value={form.buy_date}
                onChange={(e) => setForm({ ...form, buy_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trade-sell-price">Sell Price (optional)</Label>
              <Input
                id="trade-sell-price"
                type="number"
                step="0.01"
                value={form.sell_price}
                onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trade-sell-date">Sell Date (optional)</Label>
              <Input
                id="trade-sell-date"
                type="date"
                value={form.sell_date}
                onChange={(e) => setForm({ ...form, sell_date: e.target.value })}
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="trade-notes">Notes (optional)</Label>
              <Input
                id="trade-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <DialogFooter className="col-span-2 mt-2">
              <Button type="button" variant="outline" onClick={handleCancelForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={validatingSymbol || addTrade.isPending || updateTrade.isPending}>
                {validatingSymbol || addTrade.isPending || updateTrade.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                {validatingSymbol
                  ? "Validating..."
                  : addTrade.isPending || updateTrade.isPending
                  ? "Saving..."
                  : editingId
                  ? "Update Trade"
                  : "Save Trade"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Date filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(["all", "week", "month", "custom"] as DateFilterPreset[]).map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={datePreset === preset ? "default" : "outline"}
            onClick={() => setDatePreset(preset)}
          >
            {preset === "all" ? "All time" : preset === "week" ? "Past week" : preset === "month" ? "Past month" : "Custom"}
          </Button>
        ))}
        {datePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40" />
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading trades...</p>
      ) : filteredTrades.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {trades && trades.length > 0
            ? "No trades in the selected time period."
            : "No trades recorded yet. Add your first trade above."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 pr-4 font-medium">Symbol</th>
                <th className="text-left py-2 pr-4 font-medium">Direction</th>
                <th className="text-right py-2 pr-4 font-medium">Qty</th>
                <th className="text-right py-2 pr-4 font-medium">Buy Price</th>
                <th className="text-right py-2 pr-4 font-medium">Total Hold</th>
                <th className="text-left py-2 pr-4 font-medium">Buy Date</th>
                <th className="text-right py-2 pr-4 font-medium">Sell Price</th>
                <th className="text-left py-2 pr-4 font-medium">Sell Date</th>
                <th className="text-right py-2 pr-4 font-medium">P&L</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade) => {
                const pnl = getPnL(trade);
                return (
                  <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 pr-4 font-mono font-bold text-foreground">{trade.symbol}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          trade.direction === "short" ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                        }`}
                      >
                        {trade.direction === "short" ? "Short" : "Long"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-foreground">{trade.quantity}</td>
                    <td className="py-3 pr-4 text-right font-mono text-foreground">${trade.buyPrice.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-right font-mono text-foreground">${getTotalHold(trade).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{trade.buyDate}</td>
                    <td className="py-3 pr-4 text-right font-mono text-foreground">
                      {trade.sellPrice ? `$${trade.sellPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{trade.sellDate || "—"}</td>
                    <td className={`py-3 pr-4 text-right font-mono ${pnl ? (pnl.pnl >= 0 ? "price-up" : "price-down") : "text-muted-foreground"}`}>
                      {pnl ? `${pnl.pnl >= 0 ? "+" : ""}$${pnl.pnl.toFixed(2)} (${pnl.pnlPercent.toFixed(1)}%)` : "Open"}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(trade)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(trade.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TradesPanel;
