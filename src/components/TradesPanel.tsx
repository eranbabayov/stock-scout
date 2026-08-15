import React, { useState } from "react";
import { useUserTrades, useAddTrade, useDeleteTrade } from "@/hooks/useStocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Trash2, Plus, BookOpen } from "lucide-react";
import { toast } from "sonner";

const TradesPanel: React.FC = () => {
  const { data: trades, isLoading } = useUserTrades();
  const addTrade = useAddTrade();
  const deleteTrade = useDeleteTrade();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    buy_price: "",
    buy_date: "",
    sell_price: "",
    sell_date: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addTrade.mutateAsync({
        symbol: form.symbol.toUpperCase(),
        buy_price: parseFloat(form.buy_price),
        buy_date: form.buy_date,
        sell_price: form.sell_price ? parseFloat(form.sell_price) : undefined,
        sell_date: form.sell_date || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Trade added");
      setForm({ symbol: "", buy_price: "", buy_date: "", sell_price: "", sell_date: "", notes: "" });
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrade.mutateAsync(id);
      toast.success("Trade removed");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getPnL = (trade: any) => {
    if (!trade.sellPrice) return null;
    const pnl = trade.sellPrice - trade.buyPrice;
    const pnlPercent = (pnl / trade.buyPrice) * 100;
    return { pnl: Math.round(pnl * 100) / 100, pnlPercent: Math.round(pnlPercent * 100) / 100 };
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Trade Journal</h3>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" /> Add Trade
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 mb-6 p-4 rounded-lg bg-muted/50">
          <Input placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required className="font-mono" />
          <Input type="number" step="0.01" placeholder="Buy Price" value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} required />
          <Input type="date" placeholder="Buy Date" value={form.buy_date} onChange={(e) => setForm({ ...form, buy_date: e.target.value })} required />
          <Input type="number" step="0.01" placeholder="Sell Price (optional)" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
          <Input type="date" placeholder="Sell Date (optional)" value={form.sell_date} onChange={(e) => setForm({ ...form, sell_date: e.target.value })} />
          <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="col-span-2 flex gap-2">
            <Button type="submit" disabled={addTrade.isPending}>
              {addTrade.isPending ? "Saving..." : "Save Trade"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading trades...</p>
      ) : !trades || trades.length === 0 ? (
        <p className="text-muted-foreground text-sm">No trades recorded yet. Add your first trade above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 font-medium">Symbol</th>
                <th className="text-right py-2 font-medium">Buy Price</th>
                <th className="text-left py-2 font-medium">Buy Date</th>
                <th className="text-right py-2 font-medium">Sell Price</th>
                <th className="text-left py-2 font-medium">Sell Date</th>
                <th className="text-right py-2 font-medium">P&L</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const pnl = getPnL(trade);
                return (
                  <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 font-mono font-bold text-foreground">{trade.symbol}</td>
                    <td className="py-3 text-right font-mono text-foreground">${trade.buyPrice.toFixed(2)}</td>
                    <td className="py-3 text-muted-foreground">{trade.buyDate}</td>
                    <td className="py-3 text-right font-mono text-foreground">
                      {trade.sellPrice ? `$${trade.sellPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-3 text-muted-foreground">{trade.sellDate || "—"}</td>
                    <td className={`py-3 text-right font-mono ${pnl ? (pnl.pnl >= 0 ? "price-up" : "price-down") : "text-muted-foreground"}`}>
                      {pnl ? `${pnl.pnl >= 0 ? "+" : ""}$${pnl.pnl.toFixed(2)} (${pnl.pnlPercent.toFixed(1)}%)` : "Open"}
                    </td>
                    <td className="py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(trade.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
