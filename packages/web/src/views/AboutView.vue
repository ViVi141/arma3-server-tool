<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { ref } from "vue";

defineProps<{ connectionId: string; serverUuid: string }>();

const showReward = ref(false);

function openGithub() {
  window.open("https://github.com/ViVi141/arma3-server-tool", "_blank");
}
</script>

<template>
  <ConsolePageLayout>
    <h2>关于 Arma3 Server Tools</h2>
    <el-card style="max-width: 640px; margin-top: 12px;">
      <h3>v2.0.0-alpha</h3>
      <el-divider />
      <p><strong>项目来源:</strong> 从 C# / WinForms 迁移至 TypeScript 全栈</p>
      <p><strong>维护者:</strong> ViVi141</p>
      <p><strong>上游:</strong> <a href="https://github.com/airmoer/arma3-server-tool" target="_blank">airmoer/arma3-server-tool</a></p>
      <p><strong>原作者:</strong> destiny studio (Blue, 七龙)</p>
      <el-divider />
      <p><strong>技术栈:</strong></p>
      <ul>
        <li>后端: Node.js + Fastify + SQLite (sql.js)</li>
        <li>前端: Vue 3 + Element Plus + Pinia</li>
        <li>BattlEye RCon V2 协议</li>
        <li>SteamCMD 集成</li>
        <li>跨平台 (Windows / Linux / macOS)</li>
      </ul>
      <el-divider />
      <p>Copyright (C) 2026 ViVi141</p>
      <p>Based on original work copyright 2022 destiny studio (Blue, 七龙).</p>
      <div style="margin-top: 8px; display: flex; gap: 8px;">
        <el-button type="primary" @click="openGithub">GitHub</el-button>
        <el-button @click="showReward = true">赞赏支持</el-button>
      </div>
    </el-card>

    <el-dialog v-model="showReward" title="赞赏支持" width="480px">
      <p style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 12px;">
        如果本工具对你有帮助，欢迎请作者喝杯咖啡
      </p>
      <div class="reward-row">
        <div class="reward-item">
          <img src="/assets/reward-wechat.png" alt="微信赞赏" />
          <span>微信</span>
        </div>
        <div class="reward-item">
          <img src="/assets/reward-alipay.jpg" alt="支付宝赞赏" />
          <span>支付宝</span>
        </div>
      </div>
    </el-dialog>
  </ConsolePageLayout>
</template>

<style scoped>
.reward-row { display: flex; gap: 16px; justify-content: center; }
.reward-item { text-align: center; font-size: 12px; }
.reward-item img { width: 180px; height: 180px; object-fit: contain; border: 1px solid var(--el-border-color-light); }
</style>
