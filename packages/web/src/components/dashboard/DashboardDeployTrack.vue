<script setup lang="ts">
import { inject, ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useConnectionsStore } from "@/stores/connections";
import { CONSOLE_ACTIONS_KEY } from "@/composables/consoleActions";
import { UI_COPY } from "@/constants/uiCopy";
import type { DashboardData, ServerStatus } from "@a3st/api-client";

const props = defineProps<{
  connectionId: string;
  serverUuid: string;
  status: ServerStatus | null;
  dashboard: DashboardData | null;
}>();

const router = useRouter();
const store = useConnectionsStore();
const actions = inject(CONSOLE_ACTIONS_KEY);

const DEPLOY_STEPS = ["STEAMCMD", "DEDICATED", "INSTANCE", "LAUNCH"];

const steamInstalled = ref(false);
const hasServerDir = ref(false);

const isRunning = computed(() => props.status?.isRunning === true);
const cfgWritten = computed(() => props.dashboard?.cfgWritten === true);

const stepDone = computed(() => [
  steamInstalled.value,
  hasServerDir.value,
  true,
  isRunning.value,
]);

const stepActive = computed(() => {
  for (let i = 0; i < stepDone.value.length; i++) {
    if (!stepDone.value[i]) {
      return i;
    }
  }
  return stepDone.value.length - 1;
});

const showTrack = computed(() => {
  if (isRunning.value) {
    return false;
  }
  return !cfgWritten.value || !stepDone.value[0] || !stepDone.value[1];
});

onMounted(() => {
  loadDeployState();
});

async function loadDeployState() {
  try {
    const client = store.getClient();
    if (!client) {
      return;
    }
    const [steamRes, cfgRes] = await Promise.all([
      client.steamCmdStatus(),
      client.getConfig(props.serverUuid),
    ]);
    if (steamRes.success) {
      steamInstalled.value = steamRes.data.isInstalled === true;
    }
    if (cfgRes.success) {
      const server = (cfgRes.data.server ?? {}) as Record<string, unknown>;
      const dir = String(server.serverDir ?? "").trim();
      hasServerDir.value = dir.length > 0 && dir !== "-";
    }
  } catch {
    /* ignore */
  }
}

function goTab(tab: string) {
  router.push(`/console/${props.connectionId}/${tab}`);
}

function openWizard() {
  if (actions) {
    actions.openWizard();
  }
}
</script>

<template>
  <section v-if="showTrack" class="dash-deploy" data-testid="dashboard-deploy-track">
    <article class="dash-module dash-module--dark dash-deploy__card">
      <p class="dash-module__code">SRV-03 / DEPLOY</p>
      <h3>首服序列</h3>
      <p class="dash-module__body">
        SteamCMD → 专用服务器 → 创建实例 → 写入配置并启动。
      </p>
      <div class="dash-deploy__steps" aria-label="部署进度">
        <span
          v-for="(step, index) in DEPLOY_STEPS"
          :key="step"
          class="dash-deploy__step"
          :class="{
            'is-done': stepDone[index],
            'is-active': index === stepActive && !stepDone[index],
          }"
        >
          {{ step }}
        </span>
      </div>
      <div class="dash-deploy__actions">
        <button type="button" class="dash-module__link" data-testid="dashboard-deploy-wizard" @click="openWizard">
          {{ UI_COPY.firstServerWizard }} →
        </button>
        <button v-if="!steamInstalled" type="button" class="dash-module__link" @click="goTab('steamcmd')">
          SteamCMD →
        </button>
        <button v-if="!cfgWritten" type="button" class="dash-module__link" @click="goTab('preflight')">
          {{ UI_COPY.preflight }} →
        </button>
      </div>
    </article>
  </section>
</template>
