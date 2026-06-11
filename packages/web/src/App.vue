<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const isMobile = computed(() => import.meta.env.VITE_APP_MODE === "mobile");

const navItems = computed(() => {
  const items = [
    { path: "/connections", label: "连接" },
  ];
  if (!isMobile.value) {
    items.push({ path: "/settings/host", label: "被控设置" });
  }
  return items;
});
</script>

<template>
  <el-container class="app-shell">
    <el-header v-if="!isMobile" class="app-header" height="48px">
      <el-menu
        mode="horizontal"
        :default-active="route.path"
        :ellipsis="false"
        router
      >
        <el-menu-item v-for="item in navItems" :key="item.path" :index="item.path">
          {{ item.label }}
        </el-menu-item>
      </el-menu>
      <span class="app-title">Arma3 Server Tools</span>
    </el-header>

    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
}

.app-shell {
  height: 100%;
}

.app-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-light);
  padding: 0 16px;
}

.app-header .el-menu {
  flex: 1;
  border-bottom: none;
}

.app-title {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  margin-left: 12px;
}

.app-main {
  padding: 16px;
  overflow-y: auto;
}
</style>
