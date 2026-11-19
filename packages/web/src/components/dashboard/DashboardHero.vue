<script setup lang="ts">
import { computed, inject } from "vue";
import { CONSOLE_ACTIONS_KEY } from "@/composables/consoleActions";
import type { DashboardData, ServerStatus } from "@a3st/api-client";

const props = defineProps<{
  status: ServerStatus | null;
  dashboard: DashboardData | null;
  loading: boolean;
}>();

const actions = inject(CONSOLE_ACTIONS_KEY);

const isRunning = computed(() => props.status?.isRunning === true);
const cfgWritten = computed(() => actions?.cfgWritten.value === true);

const heroTitle = computed(() => {
  // 实例名优先用配置里的名称（顶栏一致），「-」这类占位值不算数
  const instance = actions?.instanceLabel.value?.trim() ?? "";
  const host = props.dashboard?.hostname?.trim() ?? "";
  const candidate = instance && instance !== "-" ? instance : host && host !== "-" ? host : "";
  if (!candidate) {
    return "未命名实例";
  }
  return candidate.length > 28 ? `${candidate.slice(0, 28)}…` : candidate;
});

function onlineText(): string {
  if (!props.status?.isRunning) {
    return "-";
  }
  if (props.dashboard?.onlineCount === null || props.dashboard?.onlineCount === undefined) {
    return "?";
  }
  return String(props.dashboard.onlineCount);
}
</script>

<template>
  <section class="dash-band" aria-labelledby="dash-hero-title" data-testid="dashboard-hero">
    <div class="dash-band__id">
      <p class="dash-band__eyebrow">实例</p>
      <h1 id="dash-hero-title" class="dash-band__title">{{ heroTitle }}</h1>
      <p class="dash-band__meta">
        <template v-if="isRunning">
          运行中 · {{ dashboard?.hostname ?? "—" }}:{{ dashboard?.port ?? "-" }}
        </template>
        <template v-else-if="cfgWritten">
          实例已停止 · 可从顶部操作栏启动
        </template>
        <template v-else>
          尚未写入游戏配置 · 先点顶部「应用更改」再启动
        </template>
      </p>
    </div>

    <div class="dash-band__state">
      <span class="dash-band__pill" :class="isRunning ? 'is-on' : 'is-off'">
        {{ isRunning ? "运行中" : "已停止" }}
      </span>
      <p v-if="!cfgWritten" class="dash-band__hint">尚未写入游戏配置</p>
    </div>

    <dl class="dash-band__metrics" aria-label="实例读数">
      <div class="dash-band__metric">
        <dt>在线</dt>
        <dd>{{ onlineText() }}</dd>
      </div>
      <div class="dash-band__metric">
        <dt>端口</dt>
        <dd>{{ dashboard?.port ?? "-" }}</dd>
      </div>
      <div class="dash-band__metric">
        <dt>PID</dt>
        <dd>{{ status?.pid ?? "-" }}</dd>
      </div>
    </dl>
  </section>
</template>
