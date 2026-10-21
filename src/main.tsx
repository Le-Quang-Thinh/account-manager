import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'
import { initStore } from './tools/accounts/store'

// nạp dữ liệu từ file JSON trước khi vẽ giao diện
initStore().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />)
})
