<script setup lang="ts">
const props = defineProps<{ connectionId: string; serverUuid: string }>();
</script>
<template>
  <div class="about-page">
    <h2>关于 Arma3 Server Tools</h2>
    <el-card style="max-width: 600px; margin-top: 12px;">
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
      <el-button type="primary" @click="window.open('https://github.com/ViVi141/arma3-server-tool', '_blank')" style="margin-top: 8px;">GitHub</el-button>
    </el-card>
  </div>
</template>
<script lang="ts">
const win = window as typeof window & { open: (url: string, target: string) => void };
export default { methods: { window: win } };
</script>
