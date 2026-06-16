import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

if (window.location.pathname === '/') {
  window.history.replaceState({}, '', '/cotizacion')
}

createApp(App).mount('#app')
