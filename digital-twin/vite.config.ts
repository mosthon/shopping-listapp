import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 상대 경로 빌드 → 정적 파일 서버 / LabVIEW 웹서버 / 파일 공유 어디서든 배포 가능
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three') || id.includes('postprocessing') || id.includes('n8ao')) return 'r3f';
        },
      },
    },
  },
});
