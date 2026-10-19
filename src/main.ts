import { mount } from 'svelte';
import './app.css';
import './details.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
