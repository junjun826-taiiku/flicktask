// The current app at "/" (until the new design at /next takes over).
import { mount } from 'svelte';
import './app.css';
import './details.css';
import './events.css';
import './live.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
