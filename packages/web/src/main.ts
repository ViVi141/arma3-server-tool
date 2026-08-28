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
app.use(createPinia());
app.use(ElementPlus, { size: "small" });
app.use(router);
app.mount("#app");
