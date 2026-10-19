export type ToastItem = { id: number; text: string; action?: { label: string; run: () => void } };

let seq = 0;

class Toasts {
  items = $state<ToastItem[]>([]);

  show(text: string, action?: ToastItem['action'], ms = 4000) {
    const item = { id: ++seq, text, action };
    this.items = [...this.items.slice(-2), item];
    setTimeout(() => this.dismiss(item.id), ms);
  }
  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
