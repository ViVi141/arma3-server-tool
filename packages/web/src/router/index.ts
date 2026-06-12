import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

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
    path: "/console/:connectionId/:tab",
    name: "console",
    component: () => import("../views/ServerConsoleView.vue"),
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
