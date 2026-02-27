import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("xlsx")) return "vendor-xlsx";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("react-router") || id.includes("@remix-run/router"))
            return "vendor-router";
          if (
            id.includes("react-dom") ||
            id.includes("react") ||
            id.includes("scheduler")
          )
            return "vendor-react";
        },
      },
    },
  },
});
