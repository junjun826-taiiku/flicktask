// 当日モード (/events/:id/live): the day-of phone screen, with its own styles.
import { mount } from 'svelte';
import './app.css';
import './details.css';
import './live.css';
import LiveApp from './LiveApp.svelte';

mount(LiveApp, { target: document.getElementById('app')! });
