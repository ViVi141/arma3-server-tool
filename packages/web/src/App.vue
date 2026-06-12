<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
const isConsole = () => route.path.startsWith("/console/");
</script>

<template>
  <div class="app-shell">
    <!-- Slim desktop-style title bar -->
    <div class="title-bar">
      <div class="title-bar-left">
        <span class="app-logo">⛏</span>
        <span class="app-name">Arma3 Server Tools</span>
        <span class="app-version">v2.0.0</span>
      </div>
      <div class="title-bar-center" v-if="isConsole()">
        <router-link to="/connections" class="back-link">← 返回连接管理</router-link>
      </div>
      <div class="title-bar-right">
      </div>
    </div>
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; overflow: hidden; }

.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
}

.title-bar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  background: #2c3e50;
  color: #ecf0f1;
  font-size: 13px;
  user-select: none;
  flex-shrink: 0;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-logo { font-size: 16px; }
.app-name { font-weight: 600; }
.app-version { font-size: 11px; opacity: 0.6; }

.title-bar-center {
  flex: 1;
  text-align: center;
}

.back-link {
  color: #95a5a6;
  text-decoration: none;
  font-size: 12px;
}
.back-link:hover { color: #ecf0f1; }

.title-bar-right { display: flex; align-items: center; gap: 6px; }

.app-content {
  flex: 1;
  overflow: hidden;
}

/* Override Element Plus for desktop feel */
.el-card { border-radius: 0 !important; box-shadow: none !important; border: 1px solid var(--el-border-color-light); }
.el-dialog { border-radius: 0 !important; }
.el-menu { border-right: none !important; }
.el-button { border-radius: 2px !important; }
.el-input__inner { border-radius: 2px !important; }
.el-table { border-radius: 0 !important; }
.el-tabs__item { border-radius: 0 !important; }
.el-tabs--border-card { border-radius: 0 !important; border: 1px solid var(--el-border-color-light); box-shadow: none !important; }
.el-tabs--border-card > .el-tabs__header { background: var(--el-fill-color-light); }
.el-divider { margin: 12px 0 !important; }
.el-form-item { margin-bottom: 12px !important; }
body { font-size: 13px; }
.el-table__body { font-size: 13px; }
.el-message { border-radius: 2px !important; }
</style>
