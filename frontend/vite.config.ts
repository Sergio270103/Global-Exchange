import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: "/", // Cambiado a '/' para compatibilidad con Vercel

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    host: '0.0.0.0',
    allowedHosts: true, // Permite conexiones desde ngrok y dispositivos en tu red local
  },
});