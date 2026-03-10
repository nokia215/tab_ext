import '../shared/ui.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Popup root element was not found.');
}

mount(App, { target });
