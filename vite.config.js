import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        // 큰 lazy 청크(엑셀)는 첫 방문 시 precache 하지 않음 → 첫 로딩 부담 ↓
        globIgnores: ['**/excel-*.js'],
        // 사용자가 엑셀 기능을 실제로 호출한 시점에 받아서, 그 다음부터는 캐시에서 즉시 응답
        runtimeCaching: [
          {
            urlPattern: /\/assets\/excel-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'excel-chunk-cache',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1년
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'LETUS LOGIS',
        short_name: 'LOGIS',
        description: '물류 입고 특이사항 등록',
        theme_color: '#1e3a5f',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/mobile',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    // 번들 사이즈 경고 임계값을 1MB 로 상향 (이미 청크 분리해서 의미 있는 경고만 보이도록)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 라이브러리별로 청크를 분리해서 캐시 효율 + 초기 로딩 속도 개선
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // 차트 (큼, AccidentManagement / LogisticsDashboard / AccidentAnalyticsReport 에서만 사용)
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
            return 'charts'
          }
          // 엑셀 (큼, 여러 페이지에서 import → globally 분리)
          if (id.includes('xlsx')) {
            return 'excel'
          }
          // Supabase
          if (id.includes('@supabase')) {
            return 'supabase'
          }
          // (참고) react-markdown 은 의존성 그래프가 vendor 와 얽혀서
          //        별도 청크로 분리하면 circular chunk 경고 발생 → vendor 에 통합
          // React 코어 (가장 자주 캐싱되므로 분리)
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }
          // 나머지 node_modules → 하나의 vendor 청크로
          return 'vendor'
        }
      }
    }
  }
})
