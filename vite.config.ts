import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.data/**"],
    },
    watch: { ignored: ["**/public/vendor/**", "**/.data/**"] },
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/socket.io": { target: "http://127.0.0.1:4000", ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 2500 },
});
