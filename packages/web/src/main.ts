import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "@/styles/desktop-theme.css";
import "@/styles/ark-visual.css";
import "@/styles/shell-v2.css";
import App from "./App.vue";
import { router } from "./router";
import { initSystemTheme } from "@/utils/systemTheme";
import { initVisualTheme } from "@/utils/visualTheme";

initSystemTheme();
initVisualTheme();

const app = createApp(App);
app.config.errorHandler = (err, _instance, info) => {
  console.error("Vue error:", err, info);
  const root = document.getElementById("app");
  if (!root || root.querySelector("[data-vue-fatal]")) {
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  const banner = document.createElement("div");
  banner.dataset.vueFatal = "1";
  banner.style.cssText =
    "position:fixed;z-index:99999;left:0;right:0;top:0;padding:12px 16px;"
    + "background:#c42b1c;color:#fff;font:13px/1.4 Segoe UI,sans-serif";
  banner.textContent = `界面异常：${message}（${info}）。可点「返回主机连接」或重启应用。`;
  root.prepend(banner);
};
app.use(createPinia());
app.use(ElementPlus, { size: "small" });
app.use(router);
app.mount("#app");
