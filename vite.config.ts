import { defineConfig, loadEnv, type Plugin } from 'vite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Firebase 로그인 도우미 경로(/__/auth, /__/firebase)를 우리 도메인에서 Firebase로 프록시한다.
 * iOS 사파리·홈 화면 앱은 다른 도메인(firebaseapp.com)의 저장소를 막기 때문에, 로그인 창이
 * 우리 도메인에서 열려야 리디렉션 로그인이 끝까지 완료된다. (Firebase 문서: redirect best practices, 옵션 3)
 * 프로젝트 ID는 환경 변수에서 읽어 빌드할 때 dist/_redirects를 만든다.
 */
function firebaseAuthProxy(projectId: string | undefined): Plugin {
  return {
    name: 'firebase-auth-proxy',
    apply: 'build',
    writeBundle(opts) {
      if (!projectId) return;
      const target = `https://${projectId}.firebaseapp.com`;
      const rules = [`/__/auth/*  ${target}/__/auth/:splat  200!`, `/__/firebase/*  ${target}/__/firebase/:splat  200!`];
      writeFileSync(join(opts.dir ?? 'dist', '_redirects'), rules.join('\n') + '\n');
    },
  };
}

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    firebaseAuthProxy({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }.VITE_FIREBASE_PROJECT_ID),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MODUS',
        short_name: 'MODUS',
        description: '계획하고, 실행하고, 기록으로 다음 계획을 고치는 학습 관리',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#fafaf9',
        theme_color: '#fafaf9',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // 로그인 도우미 페이지는 서비스 워커가 가로채지 않게 (가로채면 로그인 창 대신 앱이 열림)
        navigateFallbackDenylist: [/^\/__\//], globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
