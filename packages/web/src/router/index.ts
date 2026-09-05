import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import ServerConsoleView from "../views/ServerConsoleView.vue";

const isMobile = import.meta.env.VITE_APP_MODE === "mobile";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/connections",
  },
  {
    path: "/connections",
    name: "connections",
    component: () => import("../views/ConnectionsView.vue"),
  },
  {
    path: "/demo",
    name: "demo-index",
    component: () => import("../views/demo/StyleDemoIndexView.vue"),
  },
  {
    path: "/demo/refined",
    name: "demo-refined",
    component: () => import("../views/demo/StyleDemoRefinedView.vue"),
  },
  {
    path: "/demo/modern",
    name: "demo-modern",
    component: () => import("../views/demo/StyleDemoModernView.vue"),
  },
  {
    path: "/demo/ark",
    name: "demo-ark",
    component: () => import("../views/demo/StyleDemoArkView.vue"),
  },
  ...(isMobile
    ? []
    : [
        {
          path: "/settings/host",
          name: "host-settings",
          component: () => import("../views/HostSettingsView.vue"),
        },
      ]),
  {
    path: "/console/:connectionId",
    redirect: (to) => ({
      path: `/console/${String(to.params.connectionId)}/dashboard`,
    }),
  },
  {
    // 同步加载：避免 Electron/file 或静态托管下异步 chunk 失败后整页白屏。
    path: "/console/:connectionId/:tab",
    name: "console",
    component: ServerConsoleView,
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.onError((error) => {
  console.error("Vue Router error:", error);
  const root = document.getElementById("app");
  if (!root) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML =
    `<div style="padding:24px;font-family:Segoe UI,sans-serif;color:#1e1e1e;background:#fff;min-height:100vh">`
    + `<h2 style="margin:0 0 12px">页面加载失败</h2>`
    + `<p style="margin:0 0 8px">路由切换出错，请重启应用或返回主机连接页。</p>`
    + `<pre style="white-space:pre-wrap;background:#f3f3f3;padding:12px;border-radius:4px">${message}</pre>`
    + `<p><a href="#/connections">返回主机连接</a></p>`
    + `</div>`;
});
