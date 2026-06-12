<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
const isConsole = () => route.path.startsWith("/console/");
const isMobile = import.meta.env.VITE_APP_MODE === "mobile";
</script>

<template>
  <div class="app-shell">
    <div class="title-bar">
      <div class="title-bar-left">
        <span class="app-mark" aria-hidden="true" />
        <span class="app-name">Arma3 Server Tools</span>
        <span class="app-version">v2.0</span>
      </div>
      <div class="title-bar-center" />
      <div class="title-bar-right">
        <router-link
          v-if="isConsole()"
          to="/connections"
          class="title-link"
        >
          连接
        </router-link>
        <router-link
          v-if="!isMobile"
          to="/settings/host"
          class="title-link"
        >
          被控设置
        </router-link>
      </div>
    </div>
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>
