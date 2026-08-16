import React, { useState } from "react";
import { useAlerts, useCreatePriceAlert, useCreateMovingAverageAlert, useDeleteAlert } from "@/hooks/useStocks";
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
import { Bell, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { validateStock } from "@/lib/stockApi";
import type { StockAlert } from "@/lib/types";

type AlertKind = "price" | "moving_average";

function describeAlert(alert: StockAlert): string {
  return alert.kind === "price"
    ? `Alert when it hits $${alert.targetPrice}`
    : `Alert when it crosses ${alert.direction} its ${alert.indicatorPeriod}-day ${alert.indicatorType}`;
}

const AlertsPanel: React.FC = () => {
  const { data: alerts, isLoading } = useAlerts();
  const createPriceAlert = useCreatePriceAlert();
  const createMaAlert = useCreateMovingAverageAlert();
  const deleteAlert = useDeleteAlert();

  const emptyForm = {
    symbol: "",
    kind: "price" as AlertKind,
    target_price: "",
    indicator_type: "EMA" as "EMA" | "SMA",
    indicator_period: "50",
  };

  const [showForm, setShowForm] = useState(false);
  const [validating, setValidating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const isSaving = createPriceAlert.isPending || createMaAlert.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol) return;

    setValidating(true);
    const valid = await validateStock(symbol);
    setValidating(false);

    if (!valid) {
      toast.error(`"${symbol}" is not a valid stock symbol`);
      return;
    }

    try {
      if (form.kind === "price") {
        const targetPrice = parseFloat(form.target_price);
        if (!targetPrice || targetPrice <= 0) {
          toast.error("Enter a target price greater than 0");
          return;
        }
        await createPriceAlert.mutateAsync({ symbol, target_price: targetPrice });
      } else {
        const period = parseInt(form.indicator_period, 10);
        if (!period || period <= 0) {
          toast.error("Enter a period greater than 0");
          return;
        }
        await createMaAlert.mutateAsync({ symbol, indicator_type: form.indicator_type, indicator_period: period });
      }
      toast.success(`Alert set for ${symbol}`);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (alert: StockAlert) => {
    try {
      await deleteAlert.mutateAsync(alert.id);
      toast.success(`Alert for ${alert.symbol} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const activeAlerts = alerts?.filter((a) => a.status === "active") ?? [];
  const triggeredAlerts = alerts?.filter((a) => a.status === "triggered") ?? [];

  const renderAlertRow = (alert: StockAlert) => (
    <div
      key={alert.id}
      className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
    >
      <div>
        <span className="font-mono font-bold text-foreground mr-2">{alert.symbol}</span>
        <span className="text-sm text-muted-foreground">{describeAlert(alert)}</span>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(alert)}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Alerts</h3>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Alert
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set an Alert</DialogTitle>
            <DialogDescription>
              Get a one-time email when a stock hits a price or crosses a moving average.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="alert-symbol">Symbol</Label>
              <SymbolAutocomplete
                id="alert-symbol"
                placeholder="AAPL"
                value={form.symbol}
                onChange={(symbol) => setForm({ ...form, symbol })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alert-kind">Alert type</Label>
              <Select value={form.kind} onValueChange={(value) => setForm({ ...form, kind: value as AlertKind })}>
                <SelectTrigger id="alert-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">Target price</SelectItem>
                  <SelectItem value="moving_average">Moving average cross</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.kind === "price" ? (
              <div className="space-y-1.5">
                <Label htmlFor="alert-target-price">Target price</Label>
                <Input
                  id="alert-target-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.target_price}
                  onChange={(e) => setForm({ ...form, target_price: e.target.value })}
                  required
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="alert-indicator-type">Average type</Label>
                  <Select
                    value={form.indicator_type}
                    onValueChange={(value) => setForm({ ...form, indicator_type: value as "EMA" | "SMA" })}
                  >
                    <SelectTrigger id="alert-indicator-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMA">EMA</SelectItem>
                      <SelectItem value="SMA">SMA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alert-indicator-period">Period (days)</Label>
                  <Input
                    id="alert-indicator-period"
                    type="number"
                    step="1"
                    min="1"
                    value={form.indicator_period}
                    onChange={(e) => setForm({ ...form, indicator_period: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={validating || isSaving}>
                {validating || isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {validating ? "Validating..." : isSaving ? "Saving..." : "Set Alert"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading alerts...</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-1">
              Active {activeAlerts.length > 0 && `(${activeAlerts.length})`}
            </h4>
            {activeAlerts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active alerts.</p>
            ) : (
              activeAlerts.map(renderAlertRow)
            )}
          </div>

          {triggeredAlerts.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Triggered ({triggeredAlerts.length})</h4>
              {triggeredAlerts.map(renderAlertRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
