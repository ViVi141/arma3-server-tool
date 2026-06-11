import { createRouter, createWebHashHistory } from "vue-router";

const isMobile = import.meta.env.VITE_APP_MODE === "mobile";

const routes = [
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
    component: () => import("../views/ServerConsoleView.vue"),
    children: [
      {
        path: "",
        redirect: (to: { params: { connectionId: string } }) =>
          `/console/${to.params.connectionId}/dashboard`,
      },
      {
        path: "dashboard",
        name: "dashboard",
        component: () => import("../views/DashboardView.vue"),
      },
      {
        path: "missions",
        name: "missions",
        component: () => import("../views/MissionsView.vue"),
      },
      {
        path: "mods",
        name: "mods",
        component: () => import("../views/ModsView.vue"),
      },
      {
        path: "upload",
        name: "upload",
        component: () => import("../views/UploadView.vue"),
      },
      {
        path: "logs",
        name: "logs",
        component: () => import("../views/LogsView.vue"),
      },
      {
        path: "settings",
        name: "server-settings",
        component: () => import("../views/ConfigView.vue"),
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
