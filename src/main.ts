import { mount } from 'svelte';
import './app.css';
import './details.css';
import './events.css';
import './live.css';
import './next/next.css';
import App from './App.svelte';
import NextApp from './next/NextApp.svelte';

// The new design is built at /next alongside the current app until it takes over "/".
const isNext = location.pathname === '/next' || location.pathname.startsWith('/next/');
mount(isNext ? NextApp : App, { target: document.getElementById('app')! });
