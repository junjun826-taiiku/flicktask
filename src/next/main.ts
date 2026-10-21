// The new design at /next. Only its own styles load here, so the current app's class names can't leak in.
import { mount } from 'svelte';
import './next.css';
import NextApp from './NextApp.svelte';

mount(NextApp, { target: document.getElementById('app')! });
