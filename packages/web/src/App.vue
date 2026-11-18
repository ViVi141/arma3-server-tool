<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import M3Icon from "@/components/M3Icon.vue";
import { useThemeMode } from "@/config/theme";
import { useBackgroundTasksStore } from "@/stores/backgroundTasks";

const route = useRoute();
const isConsole = computed(() => route.path.startsWith("/console/"));
const isConnections = computed(() => {
  return route.path === "/connections" || route.path === "/";
});
const isMobile = import.meta.env.VITE_APP_MODE === "mobile";

const { themeMode, themeIcon, themeLabel, cycleThemeMode } = useThemeMode();
const bgTasks = useBackgroundTasksStore();

function onSnackbarAction(): void {
  const fn = bgTasks.snackbar.onAction;
  bgTasks.dismissSnackbar();
  fn?.();
}

function snackbarIcon(variant: "default" | "success" | "error"): string {
  if (variant === "success") {
    return "check_circle";
  }
  if (variant === "error") {
    return "error";
  }
  return "info";
}
</script>

<template>
  <div class="app-shell">
    <div v-if="!isMobile && !isConsole" class="title-bar">
      <div class="title-bar-left">
        <span class="app-mark" aria-hidden="true">
          <M3Icon name="dns" :size="16" />
        </span>
        <span class="app-name">Arma3 Server Tools</span>
        <span class="app-version">v2.0</span>
      </div>
      <div class="title-bar-center" />
      <div class="title-bar-right">
        <button
          type="button"
          class="m3-icon-btn"
          data-testid="theme-mode-select"
          :data-theme-mode="themeMode"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="cycleThemeMode"
        >
          <M3Icon :name="themeIcon" :size="20" />
        </button>
        <router-link
          v-if="!isConnections"
          to="/connections"
          class="title-link"
          data-testid="nav-back-connections"
        >
          <M3Icon name="arrow_back" :size="16" />
          <span>主机连接</span>
        </router-link>
        <router-link
          v-if="!isMobile"
          to="/settings/host"
          class="title-link"
        >
          <M3Icon name="tune" :size="16" />
          <span>被控设置</span>
        </router-link>
        <router-link
          v-if="!isMobile"
          to="/demo"
          class="title-link"
          data-testid="nav-style-demo"
        >
          <M3Icon name="palette" :size="16" />
          <span>风格演示</span>
        </router-link>
      </div>
    </div>
    <div class="app-content">
      <router-view />
    </div>

    <div
      v-if="bgTasks.activeTasks.length > 0 || bgTasks.snackbar.visible"
      class="m3-overlay-host"
      :class="{ 'is-console': isConsole }"
    >
      <section
        v-if="bgTasks.activeTasks.length > 0"
        class="m3-bg-task-banner"
        data-testid="bg-task-banner"
        role="region"
        aria-label="后台任务进度"
        aria-live="polite"
      >
        <div
          v-for="task in bgTasks.activeTasks"
          :key="task.taskId"
          class="m3-bg-task-row"
        >
          <div class="m3-bg-task-row__head">
            <M3Icon
              :name="
                task.status === 'Succeeded'
                  ? 'check_circle'
                  : task.status === 'Failed'
                    ? 'error'
                    : task.status === 'Cancelled'
                      ? 'info'
                      : 'cloud_download'
              "
              :size="18"
            />
            <div class="m3-bg-task-row__info">
              <div class="m3-bg-task-row__title">{{ task.label }}</div>
              <div
                class="m3-bg-task-row__status"
                :class="{ 'is-error': task.status === 'Failed' }"
              >
                {{ task.progressText }}
              </div>
            </div>
            <el-button
              v-if="task.status === 'Pending' || task.status === 'Running'"
              size="small"
              text
              :disabled="task.cancelling"
              @click="bgTasks.cancelTask(task.taskId)"
            >
              取消
            </el-button>
            <el-button
              v-else
              size="small"
              text
              @click="bgTasks.dismissTask(task.taskId)"
            >
              关闭
            </el-button>
          </div>
          <div
            v-if="task.status === 'Pending' || task.status === 'Running'"
            class="m3-linear-progress"
            role="progressbar"
            aria-label="任务执行中"
          >
            <div class="m3-linear-progress__bar" />
          </div>
        </div>
      </section>

      <div
        v-if="bgTasks.snackbar.visible"
        class="m3-snackbar"
        data-testid="m3-snackbar"
        role="status"
        aria-live="polite"
      >
        <span class="m3-snackbar__message">
          <M3Icon :name="snackbarIcon(bgTasks.snackbar.variant)" :size="18" />
          <span>{{ bgTasks.snackbar.message }}</span>
        </span>
        <span class="m3-snackbar__actions">
          <button
            v-if="bgTasks.snackbar.actionLabel"
            type="button"
            class="m3-snackbar__btn"
            @click="onSnackbarAction"
          >
            {{ bgTasks.snackbar.actionLabel }}
          </button>
          <button
            type="button"
            class="m3-snackbar__btn"
            aria-label="关闭通知"
            @click="bgTasks.dismissSnackbar()"
          >
            关闭
          </button>
        </span>
      </div>
    </div>
  </div>
</template>
