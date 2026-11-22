<script setup lang="ts">
import ConsolePageLayout from "@/components/ConsolePageLayout.vue";
import { computed, ref } from "vue";

defineProps<{ connectionId: string; serverUuid: string }>();

const showReward = ref(false);
const appVersion = __APP_VERSION__;
const channelLabel = computed(() => {
  if (appVersion.includes("beta")) return "Beta";
  if (appVersion.includes("alpha")) return "Alpha";
  if (appVersion.includes("rc")) return "RC";
  return "Release";
});

function openGithub() {
  window.open("https://github.com/ViVi141/arma3-server-tool", "_blank");
}

function openDocs() {
  window.open("https://github.com/ViVi141/arma3-server-tool/blob/main/docs/v2-quickstart.md", "_blank");
}

function openReleases() {
  window.open("https://github.com/ViVi141/arma3-server-tool/releases", "_blank");
}
</script>

<template>
  <ConsolePageLayout>
    <header class="about-hero">
      <p class="about-kicker">ABOUT / 关于</p>
      <h2 class="about-title">关于 Arma3 Server Tools</h2>
      <p class="about-lead">
        跨平台 Arma 3 专用服务器管理控制台：本机 Electron、浏览器远程、Linux 便携包与 Android 主控壳共用同一套 Service API。
      </p>
      <div class="about-meta">
        <span class="about-version">v{{ appVersion }}</span>
        <el-tag size="small" type="warning" effect="plain">{{ channelLabel }}</el-tag>
      </div>
    </header>

    <section class="about-section">
      <h3>能做什么</h3>
      <ul class="about-list">
        <li>多实例启停 / 重启、写入游戏配置、开服前检查</li>
        <li>Workshop 模组扫描、下载、签名公钥部署</li>
        <li>换图、任务 PBO 上传、SteamCMD 安装与更新</li>
        <li>BattlEye RCon、本地封禁、定时任务与运维维护</li>
        <li>HTTP API + Bearer Token，支持局域网 / Tailscale 远程主控</li>
      </ul>
    </section>

    <section class="about-section">
      <h3>运行环境</h3>
      <ul class="about-list">
        <li>开服机：Windows 或 Linux（Arma 3 Dedicated + SteamCMD）</li>
        <li>控制端：浏览器 / Electron 桌面版 / Android 主控壳</li>
        <li>技术栈：Node.js · Fastify · SQLite · Vue 3 · Electron · Capacitor</li>
      </ul>
    </section>

    <section class="about-section">
      <h3>项目来源</h3>
      <ul class="about-list">
        <li>维护者：ViVi141</li>
        <li>上游：<a href="https://github.com/airmoer/arma3-server-tool" target="_blank" rel="noopener">airmoer/arma3-server-tool</a></li>
        <li>原作者：destiny studio（Blue、七龙）</li>
        <li>v2 已从 C# / WinForms 迁移为 TypeScript 全栈；当前为 Beta，接口与安装包仍可能随反馈调整</li>
      </ul>
    </section>

    <section class="about-section about-actions">
      <el-button type="primary" @click="openGithub">GitHub</el-button>
      <el-button @click="openDocs">快速开始</el-button>
      <el-button @click="openReleases">下载发布</el-button>
      <el-button @click="showReward = true">赞赏支持</el-button>
    </section>

    <p class="about-copy">
      Copyright (C) 2026 ViVi141.
      Based on original work copyright 2022 destiny studio (Blue, 七龙).
    </p>

    <el-dialog v-model="showReward" title="赞赏支持" width="480px">
      <p class="about-reward-hint">
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
.about-hero {
  margin-bottom: 20px;
}
.about-kicker {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--md-sys-color-primary, var(--el-color-primary));
}
.about-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.3;
}
.about-lead {
  margin: 0 0 12px;
  max-width: 52rem;
  color: var(--el-text-color-regular);
  line-height: 1.55;
}
.about-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.about-version {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}
.about-section {
  max-width: 52rem;
  margin-bottom: 18px;
}
.about-section h3 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}
.about-list {
  margin: 0;
  padding-left: 1.2em;
  line-height: 1.65;
  color: var(--el-text-color-regular);
}
.about-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.about-copy {
  margin-top: 20px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.about-reward-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}
.reward-row {
  display: flex;
  gap: 16px;
  justify-content: center;
}
.reward-item {
  text-align: center;
  font-size: 12px;
}
.reward-item img {
  width: 180px;
  height: 180px;
  object-fit: contain;
  border: 1px solid var(--el-border-color-light);
}
</style>
