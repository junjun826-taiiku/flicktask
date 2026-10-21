// The app (everything but 当日モード). Only its own styles load here.
import { mount } from 'svelte';
import './next.css';
import NextApp from './NextApp.svelte';

mount(NextApp, { target: document.getElementById('app')! });
