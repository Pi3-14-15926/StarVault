import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import router from './router'
import { loadRemoteData } from './utils/api'
import './style.css'

async function boot() {
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(naive)
  // 先加载远程数据，再挂载 app，确保首次访问就有数据
  await loadRemoteData().catch((e) => console.warn('loadRemoteData failed:', e))
  app.mount('#app')
}
boot()
