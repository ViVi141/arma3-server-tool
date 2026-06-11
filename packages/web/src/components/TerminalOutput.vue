<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue";

const props = defineProps<{ url: string; baseUrl?: string }>();
const lines = ref<{ time: string; text: string }[]>([]);
const connected = ref(false);
const container = ref<HTMLDivElement | null>(null);
let eventSource: EventSource | null = null;

onMounted(() => {
  const base = props.baseUrl ?? "";
  const fullUrl = `${base}${props.url}`;
  eventSource = new EventSource(fullUrl);

  eventSource.onopen = () => {
    connected.value = true;
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "connected") {
        lines.value.push({ time: "", text: `--- ${data.message} ---` });
      } else if (data.type === "output") {
        lines.value.push({ time: data.time?.slice(11, 19) ?? "", text: data.text });
      }
      scrollBottom();
    } catch {
      lines.value.push({ time: "", text: event.data });
      scrollBottom();
    }
  };

  eventSource.onerror = () => {
    connected.value = false;
    lines.value.push({ time: "", text: "[连接断开]" });
  };
});

onUnmounted(() => {
  eventSource?.close();
});

function scrollBottom() {
  nextTick(() => {
    if (container.value) {
      container.value.scrollTop = container.value.scrollHeight;
    }
  });
}

function clearLog() {
  lines.value = [];
}
</script>

<template>
  <div class="terminal-wrapper">
    <div class="terminal-bar">
      <span :class="connected ? 'dot-green' : 'dot-red'" class="dot" />
      <span class="status-text">{{ connected ? '已连接' : '未连接' }}</span>
      <el-button size="small" @click="clearLog" style="margin-left: auto;">清空</el-button>
    </div>
    <div ref="container" class="terminal-output">
      <div v-if="lines.length === 0" class="terminal-empty">等待输出...</div>
      <div v-for="(line, i) in lines" :key="i" class="terminal-line">
        <span v-if="line.time" class="time">{{ line.time }}</span>
        <span class="text">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-wrapper {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}
.terminal-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
  font-size: 12px;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot-green { background: #67c23a; }
.dot-red { background: #f56c6c; }
.status-text { color: var(--el-text-color-secondary); }
.terminal-output {
  height: 300px;
  overflow-y: auto;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px;
}
.terminal-empty {
  color: #666;
  text-align: center;
  padding: 40px 0;
}
.terminal-line {
  white-space: pre-wrap;
  word-break: break-all;
}
.time {
  color: #888;
  margin-right: 8px;
  user-select: none;
}
.text { color: #d4d4d4; }
</style>
