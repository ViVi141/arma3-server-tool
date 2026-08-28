<script setup lang="ts">
import { computed, inject } from "vue";
import { UI_COPY } from "@/constants/uiCopy";
import { CONSOLE_ACTIONS_KEY } from "@/composables/consoleActions";
import type { DashboardData, ServerStatus } from "@a3st/api-client";

const props = defineProps<{
  status: ServerStatus | null;
  dashboard: DashboardData | null;
  loading: boolean;
}>();

const actions = inject(CONSOLE_ACTIONS_KEY);

const isRunning = computed(() => props.status?.isRunning === true);

const heroTitle = computed(() => {
  const host = props.dashboard?.hostname?.trim();
  if (host) {
    return host.length > 18 ? host.slice(0, 18) : host;
  }
  if (actions) {
    return actions.instanceLabel.value;
  }
  return "INSTANCE";
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

async function run(action: string): Promise<void> {
  if (!actions) {
    return;
  }
  await actions.execAction(action);
}

async function save(): Promise<void> {
  if (!actions) {
    return;
  }
  await actions.execSave();
}
</script>

<template>
  <section class="dash-hero" aria-labelledby="dash-hero-title" data-testid="dashboard-hero">
    <div class="dash-hero__grid" aria-hidden="true" />
    <div class="dash-hero__art" aria-hidden="true">
      <div class="dash-hero__orbit dash-hero__orbit-a" />
      <div class="dash-hero__orbit dash-hero__orbit-b" />
      <div class="dash-hero__core"><span /></div>
    </div>

    <div class="dash-hero__copy">
      <p class="dash-hero__kicker">
        FIELD OPS / {{ actions ? actions.instanceLabel.value : "INSTANCE" }}
      </p>
      <h1 id="dash-hero-title">
        {{ heroTitle }}
        <span class="dash-hero__outline">{{ isRunning ? "LIVE" : "IDLE" }}</span>
      </h1>
      <p class="dash-hero__lede">
        <template v-if="isRunning">
          进程 PID {{ status?.pid ?? "-" }} · 端口 {{ dashboard?.port ?? "-" }} · 在线 {{ onlineText() }}
        </template>
        <template v-else>
          实例已停止。写入配置后可在此启动，或前往部署模式做开服检查。
        </template>
      </p>
      <div v-if="actions" class="dash-hero__actions">
        <el-button
          type="success"
          data-testid="btn-start"
          :disabled="isRunning"
          @click="run('start')"
        >
          启动服务器
        </el-button>
        <el-button
          type="warning"
          data-testid="btn-restart"
          :disabled="!isRunning"
          @click="run('restart')"
        >
          重启
        </el-button>
        <el-button
          type="danger"
          data-testid="btn-stop"
          :disabled="!isRunning"
          @click="run('stop')"
        >
          停止
        </el-button>
        <el-button
          data-testid="btn-write-cfg"
          @click="run('write_cfg')"
        >
          {{ UI_COPY.writeGameCfg }}
        </el-button>
        <el-button
          :type="actions.hasDirtyChanges ? 'primary' : 'default'"
          data-testid="btn-save"
          @click="save()"
        >
          {{ UI_COPY.saveShort }}<span v-if="actions.hasDirtyChanges">*</span>
        </el-button>
      </div>
    </div>

    <aside class="dash-readout dash-hero__readout" aria-label="实例读数">
      <div class="dash-readout__head">
        <span>RELAY // INSTANCE</span>
        <span class="dash-readout__state" :class="{ 'is-stopped': !isRunning }">
          {{ isRunning ? "ONLINE" : "OFFLINE" }}
        </span>
      </div>
      <dl class="dash-readout__grid">
        <div class="dash-readout__cell">
          <dt>在线</dt>
          <dd>{{ onlineText() }}</dd>
        </div>
        <div class="dash-readout__cell">
          <dt>端口</dt>
          <dd>{{ dashboard?.port ?? "-" }}</dd>
        </div>
        <div class="dash-readout__cell">
          <dt>PID</dt>
          <dd>{{ status?.pid ?? "-" }}</dd>
        </div>
        <div class="dash-readout__cell">
          <dt>配置</dt>
          <dd class="dash-readout__truncate">{{ actions ? actions.instanceLabel.value : "-" }}</dd>
        </div>
      </dl>
      <p v-if="actions && !actions.cfgWritten" class="dash-hero__cfg-hint">
        尚未写入游戏配置
      </p>
    </aside>
  </section>
</template>
