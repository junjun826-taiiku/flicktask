// Dark is the default look of the new design; light is one click away and remembered per device.
const KEY = 'ft.theme.v1';
export type Theme = 'dark' | 'light';

function load(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

class ThemeState {
  value = $state<Theme>(load());
  toggle() {
    this.value = this.value === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, this.value);
    } catch {}
  }
}
export const theme = new ThemeState();
