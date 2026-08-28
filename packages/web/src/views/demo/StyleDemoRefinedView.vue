<script setup lang="ts">
/** 方案 A：精修工具风 — 演示用 mock 数据 */
const stats = [
  { label: "运行状态", value: "运行中", tone: "ok", icon: "●" },
  { label: "在线人数", value: "12 / 64", tone: "ok", icon: "👥" },
  { label: "游戏端口", value: "2302", tone: "neutral", icon: "⎔" },
  { label: "已装模组", value: "47", tone: "neutral", icon: "📦" },
];

const mods = [
  { name: "CBA_A3", id: "450814997", status: "最新", remote: "2025-08-20", local: "2025-08-20" },
  { name: "ACE3", id: "463939057", status: "可更新", remote: "2025-08-25", local: "2025-08-18" },
  { name: "RHS USAF", id: "843425103", status: "最新", remote: "2025-08-10", local: "2025-08-10" },
];

const connections = [
  { name: "本机 Service", url: "http://127.0.0.1:19580", online: true },
  { name: "n100 局域网", url: "http://192.168.31.176:19580", online: true },
];
</script>

<template>
  <div class="refined-demo">
    <header class="refined-demo__banner">
      <div>
        <span class="refined-demo__badge">方案 A · 精修工具风</span>
        <h1 class="refined-demo__heading">在现有 VS Code 骨架上微调层次</h1>
      </div>
      <router-link to="/demo" class="refined-demo__nav">← 方案列表</router-link>
    </header>

    <div class="refined-shell">
      <!-- 左：服务器 -->
      <aside class="refined-sidebar">
        <div class="refined-sidebar__label">服务器</div>
        <button type="button" class="refined-sidebar__item refined-sidebar__item--active">
          <span class="refined-sidebar__dot refined-sidebar__dot--run" />
          Altis COOP
        </button>
        <button type="button" class="refined-sidebar__item">
          <span class="refined-sidebar__dot" />
          Zeus Test
        </button>
      </aside>

      <!-- 中：导航 -->
      <nav class="refined-nav">
        <div class="refined-nav__group">概览</div>
        <button type="button" class="refined-nav__item refined-nav__item--active">Dashboard</button>
        <button type="button" class="refined-nav__item">模组</button>
        <button type="button" class="refined-nav__item">日志</button>
        <div class="refined-nav__group">配置</div>
        <button type="button" class="refined-nav__item">基础</button>
        <button type="button" class="refined-nav__item">网络</button>
      </nav>

      <!-- 右：内容 -->
      <main class="refined-main">
        <div class="refined-action-bar">
          <div class="refined-action-group">
            <span class="refined-action-group__label">进程</span>
            <button type="button" class="refined-btn refined-btn--success">启动</button>
            <button type="button" class="refined-btn">停止</button>
            <button type="button" class="refined-btn">重启</button>
          </div>
          <span class="refined-action-sep" />
          <div class="refined-action-group">
            <span class="refined-action-group__label">配置</span>
            <button type="button" class="refined-btn refined-btn--primary">写入 server.cfg</button>
          </div>
          <span class="refined-status">运行中 · PID 8842</span>
        </div>

        <div class="refined-content">
          <section class="refined-section">
            <h2 class="refined-section__title">Dashboard</h2>
            <div class="refined-stat-grid">
              <div
                v-for="s in stats"
                :key="s.label"
                class="refined-stat"
                :class="'refined-stat--' + s.tone"
              >
                <span class="refined-stat__icon" aria-hidden="true">{{ s.icon }}</span>
                <div>
                  <div class="refined-stat__label">{{ s.label }}</div>
                  <div class="refined-stat__value">{{ s.value }}</div>
                </div>
              </div>
            </div>
          </section>

          <section class="refined-section refined-section--half">
            <h2 class="refined-section__title">连接（卡片化）</h2>
            <div class="refined-conn-list">
              <div v-for="c in connections" :key="c.url" class="refined-conn">
                <div class="refined-conn__head">
                  <span
                    class="refined-conn__status"
                    :class="{ 'refined-conn__status--on': c.online }"
                  />
                  <span class="refined-conn__name">{{ c.name }}</span>
                </div>
                <code class="refined-conn__url">{{ c.url }}</code>
                <button type="button" class="refined-btn refined-btn--primary refined-conn__btn">
                  连接
                </button>
              </div>
            </div>
          </section>

          <section class="refined-section refined-section--half">
            <h2 class="refined-section__title">模组（列分组）</h2>
            <table class="refined-table">
              <thead>
                <tr>
                  <th colspan="2">模组</th>
                  <th colspan="2">版本</th>
                  <th>状态</th>
                </tr>
                <tr class="refined-table__subhead">
                  <th>名称</th>
                  <th>ID</th>
                  <th>远程</th>
                  <th>本地</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in mods" :key="m.id">
                  <td>{{ m.name }}</td>
                  <td class="refined-table__mono">{{ m.id }}</td>
                  <td>{{ m.remote }}</td>
                  <td>{{ m.local }}</td>
                  <td>
                    <span
                      class="refined-pill"
                      :class="m.status === '可更新' ? 'refined-pill--warn' : 'refined-pill--ok'"
                    >
                      {{ m.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="refined-section">
            <h2 class="refined-section__title">首服向导（步骤视觉）</h2>
            <ol class="refined-steps">
              <li class="refined-steps__item refined-steps__item--done">SteamCMD 路径</li>
              <li class="refined-steps__item refined-steps__item--done">下载专用服务器</li>
              <li class="refined-steps__item refined-steps__item--active">创建首个实例</li>
              <li class="refined-steps__item">写入配置并启动</li>
            </ol>
          </section>
        </div>

        <footer class="refined-statusbar">
          <span>Altis COOP</span>
          <span>·</span>
          <span>D:\Arma3Server</span>
          <span class="refined-statusbar__right">v2.0 演示</span>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.refined-demo {
  --rd-font: 13px;
  --rd-radius: 3px;
  --rd-accent: #0078d4;
  --rd-ok: #3d6b3d;
  --rd-warn: #986f0b;
  --rd-bg: var(--a3st-bg);
  --rd-panel: var(--a3st-bg-panel);
  --rd-border: var(--a3st-border-subtle);
  --rd-text: var(--a3st-text);
  --rd-muted: var(--a3st-text-muted);

  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: var(--rd-font);
  line-height: 1.45;
  color: var(--rd-text);
  background: var(--rd-bg);
}

.refined-demo__banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--rd-border);
  background: var(--rd-panel);
  flex-shrink: 0;
}

.refined-demo__badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--rd-accent);
  margin-bottom: 4px;
}

.refined-demo__heading {
  font-size: 14px;
  font-weight: 600;
}

.refined-demo__nav {
  font-size: 12px;
  color: var(--rd-accent);
  text-decoration: none;
  white-space: nowrap;
  padding-top: 4px;
}

.refined-shell {
  flex: 1;
  min-height: 0;
  display: flex;
}

.refined-sidebar {
  width: 148px;
  flex-shrink: 0;
  background: var(--rd-panel);
  border-right: 1px solid var(--rd-border);
  padding: 6px 0;
}

.refined-sidebar__label {
  padding: 6px 12px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--a3st-text-dim);
}

.refined-sidebar__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 12px;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-align: left;
  color: var(--rd-muted);
  cursor: default;
}

.refined-sidebar__item--active {
  background: var(--a3st-bg-selected);
  color: var(--a3st-text-on-selected);
}

.refined-sidebar__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--a3st-stopped);
  flex-shrink: 0;
}

.refined-sidebar__dot--run {
  background: var(--a3st-running);
}

.refined-nav {
  width: 120px;
  flex-shrink: 0;
  border-right: 1px solid var(--rd-border);
  background: var(--rd-panel);
  padding: 4px 0;
}

.refined-nav__group {
  padding: 8px 10px 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--a3st-text-dim);
}

.refined-nav__item {
  display: block;
  width: 100%;
  padding: 4px 10px 4px 12px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-align: left;
  color: var(--rd-muted);
  cursor: default;
}

.refined-nav__item--active {
  border-left-color: var(--rd-accent);
  background: var(--a3st-bg-active);
  color: var(--rd-text);
}

.refined-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.refined-action-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  background: var(--a3st-toolbar);
  border-bottom: 1px solid var(--rd-border);
}

.refined-action-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.refined-action-group__label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--a3st-text-dim);
  margin-right: 2px;
}

.refined-action-sep {
  width: 1px;
  height: 18px;
  background: var(--a3st-border);
  margin: 0 4px;
}

.refined-btn {
  padding: 3px 10px;
  font: inherit;
  font-size: 12px;
  border: 1px solid var(--a3st-border);
  border-radius: var(--rd-radius);
  background: var(--a3st-bg-input);
  color: var(--rd-text);
  cursor: default;
}

.refined-btn--primary {
  background: var(--rd-accent);
  border-color: var(--rd-accent);
  color: #fff;
}

.refined-btn--success {
  background: var(--a3st-btn-success-bg);
  border-color: var(--a3st-btn-success-border);
  color: var(--rd-text);
}

.refined-status {
  margin-left: auto;
  font-size: 11px;
  font-family: var(--a3st-font-mono);
  color: var(--rd-ok);
}

.refined-content {
  flex: 1;
  overflow: auto;
  padding: 12px 14px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-content: flex-start;
}

.refined-section {
  width: 100%;
}

.refined-section--half {
  width: calc(50% - 7px);
  min-width: 280px;
}

.refined-section__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rd-muted);
  margin-bottom: 8px;
}

.refined-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.refined-stat {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--rd-panel);
  border: 1px solid var(--rd-border);
  border-left: 3px solid var(--a3st-border);
  border-radius: var(--rd-radius);
}

.refined-stat--ok {
  border-left-color: var(--rd-ok);
}

.refined-stat__icon {
  font-size: 14px;
  line-height: 1;
  opacity: 0.85;
}

.refined-stat__label {
  font-size: 11px;
  color: var(--rd-muted);
  margin-bottom: 2px;
}

.refined-stat__value {
  font-size: 15px;
  font-weight: 600;
  font-family: var(--a3st-font-mono);
}

.refined-conn-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.refined-conn {
  padding: 10px 12px;
  background: var(--rd-panel);
  border: 1px solid var(--rd-border);
  border-radius: var(--rd-radius);
}

.refined-conn__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.refined-conn__status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--a3st-stopped);
}

.refined-conn__status--on {
  background: var(--rd-ok);
}

.refined-conn__name {
  font-weight: 600;
  font-size: 13px;
}

.refined-conn__url {
  display: block;
  font-size: 11px;
  color: var(--a3st-text-dim);
  margin-bottom: 8px;
}

.refined-conn__btn {
  font-size: 11px;
}

.refined-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--rd-panel);
  border: 1px solid var(--rd-border);
}

.refined-table th,
.refined-table td {
  padding: 5px 8px;
  border: 1px solid var(--rd-border);
  text-align: left;
}

.refined-table thead tr:first-child th {
  background: var(--a3st-bg-elevated);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--rd-muted);
}

.refined-table__subhead th {
  font-size: 11px;
  font-weight: 600;
}

.refined-table__mono {
  font-family: var(--a3st-font-mono);
  color: var(--rd-muted);
}

.refined-pill {
  display: inline-block;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 2px;
}

.refined-pill--ok {
  background: var(--a3st-btn-success-bg);
  color: var(--rd-ok);
}

.refined-pill--warn {
  background: var(--a3st-btn-warning-bg);
  color: var(--rd-warn);
}

.refined-steps {
  display: flex;
  gap: 0;
  list-style: none;
  padding: 0;
  margin: 0;
  counter-reset: step;
}

.refined-steps__item {
  flex: 1;
  position: relative;
  padding: 10px 8px 10px 28px;
  font-size: 11px;
  background: var(--rd-panel);
  border: 1px solid var(--rd-border);
  color: var(--rd-muted);
}

.refined-steps__item::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  border-radius: 50%;
  background: var(--a3st-bg-elevated);
  color: var(--rd-muted);
}

.refined-steps__item--done {
  color: var(--rd-text);
}

.refined-steps__item--done::before {
  background: var(--rd-ok);
  color: #fff;
  content: "✓";
}

.refined-steps__item--active {
  background: var(--a3st-notice-info-bg);
  border-color: var(--rd-accent);
  color: var(--rd-text);
  font-weight: 600;
}

.refined-steps__item--active::before {
  background: var(--rd-accent);
  color: #fff;
}

.refined-statusbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 10px;
  font-size: 11px;
  background: var(--a3st-statusbar);
  color: var(--a3st-statusbar-text);
  flex-shrink: 0;
}

.refined-statusbar__right {
  margin-left: auto;
  opacity: 0.9;
}

@media (max-width: 900px) {
  .refined-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .refined-section--half {
    width: 100%;
  }

  .refined-steps {
    flex-direction: column;
  }
}
</style>
