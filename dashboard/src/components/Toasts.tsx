import { useDashboard } from "../lib/store";
import { X } from "lucide-react";

export function Toasts() {
  const { toasts, dismissToast } = useDashboard();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-bg-card border border-border rounded-lg px-4 py-3 text-sm text-gray-200 shadow-lg flex items-start gap-3 animate-in"
        >
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismissToast(t.id)} className="text-muted hover:text-gray-200">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
