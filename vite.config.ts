import { defineConfig } from "vite";

// base 用相对路径，打包后放到 GitHub Pages 子目录或任意静态网站都能用。
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
