import type { Details } from './store.svelte';

/** Which task the detail sheet shows. taskId null + open = creating a new task (e.g. tapped an empty calendar slot). */
class Sheet {
  open = $state(false);
  taskId = $state<string | null>(null);
  prefill = $state<Partial<Details>>({});

  edit(id: string) {
    this.taskId = id;
    this.prefill = {};
    this.open = true;
  }
  create(prefill: Partial<Details>) {
    this.taskId = null;
    this.prefill = prefill;
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

export const sheet = new Sheet();
