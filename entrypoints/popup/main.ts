import App from '../../src/popup/App.svelte';
import { mount } from 'svelte';
import '../../src/shared/ui.css';
import '../../src/shared/panels.css';
import '../../src/popup/popup.css';

mount(App, { target: document.getElementById('app')! });
