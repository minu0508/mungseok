import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './app.css'
import App from './App'

// 글꼴은 앱이 뜬 뒤에 붙인다: <head> 의 외부 스타일시트는 CDN 이 느리면 앱 스크립트 실행까지 막는다
const font = document.createElement('link')
font.rel = 'stylesheet'
font.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'
document.head.append(font)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
