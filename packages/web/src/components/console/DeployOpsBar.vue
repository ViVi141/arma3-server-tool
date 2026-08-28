<script setup lang="ts">
import { inject } from "vue";
import { UI_COPY } from "@/constants/uiCopy";
import { CONSOLE_ACTIONS_KEY } from "@/composables/consoleActions";

const actions = inject(CONSOLE_ACTIONS_KEY);

async function run(action: string): Promise<void> {
  if (!actions) {
    return;
  }
  await actions.execAction(action);
}
</script>

<template>
  <section v-if="actions" class="deploy-ops" data-testid="deploy-ops-bar">
    <div class="deploy-ops__label">
      <span class="deploy-ops__code">DEPLOY</span>
      <span>进程与配置</span>
    </div>
    <div class="deploy-ops__buttons">
      <el-button
        size="small"
        type="success"
        data-testid="btn-start"
        :disabled="actions.isRunning"
        @click="run('start')"
      >
        启动
      </el-button>
      <el-button
        size="small"
        type="warning"
        data-testid="btn-restart"
        :disabled="!actions.isRunning"
        @click="run('restart')"
      >
        重启
      </el-button>
      <el-button
        size="small"
        type="danger"
        data-testid="btn-stop"
        :disabled="!actions.isRunning"
        @click="run('stop')"
      >
        停止
      </el-button>
      <span class="deploy-ops__sep" />
      <el-button size="small" data-testid="btn-write-cfg" @click="run('write_cfg')">
        {{ UI_COPY.writeGameCfg }}
      </el-button>
      <el-button size="small" data-testid="btn-preflight" @click="run('preflight')">
        {{ UI_COPY.preflight }}
      </el-button>
    </div>
  </section>
</template>
