<script setup lang="ts">
/** 方案 B：现代 Web 风 — 演示用 mock 数据 */
const stats = [
  { label: "运行状态", value: "运行中", sub: "PID 8842", accent: "green" },
  { label: "在线玩家", value: "12", sub: "上限 64", accent: "blue" },
  { label: "模组", value: "47", sub: "1 项可更新", accent: "amber" },
  { label: "端口", value: "2302", sub: "UDP", accent: "slate" },
];

const mods = [
  { name: "CBA_A3", id: "450814997", status: "最新", size: "42 MB" },
  { name: "ACE3", id: "463939057", status: "可更新", size: "128 MB" },
  { name: "RHS USAF", id: "843425103", status: "最新", size: "2.1 GB" },
];

const connections = [
  { name: "本机 Service", url: "127.0.0.1:19580", tag: "本地" },
  { name: "n100 局域网", url: "192.168.31.176:19580", tag: "远程" },
];
</script>

<template>
  <div class="modern-demo">
    <header class="modern-hero">
      <div class="modern-hero__inner">
        <span class="modern-hero__badge">方案 B · 现代 Web 风</span>
        <h1 class="modern-hero__title">Arma3 Server Console</h1>
        <p class="modern-hero__sub">卡片化概览 · 橄榄绿品牌点缀 · 更大留白与圆角</p>
      </div>
      <router-link to="/demo" class="modern-hero__back">← 方案列表</router-link>
    </header>

    <div class="modern-body">
      <section class="modern-block">
        <div class="modern-block__head">
          <h2>概览</h2>
          <div class="modern-block__actions">
            <button type="button" class="modern-pill modern-pill--ghost">刷新</button>
            <button type="button" class="modern-pill modern-pill--primary">启动服务器</button>
          </div>
        </div>
        <div class="modern-stat-row">
          <article
            v-for="s in stats"
            :key="s.label"
            class="modern-stat"
            :class="'modern-stat--' + s.accent"
          >
            <span class="modern-stat__label">{{ s.label }}</span>
            <span class="modern-stat__value">{{ s.value }}</span>
            <span class="modern-stat__sub">{{ s.sub }}</span>
          </article>
        </div>
      </section>

      <section class="modern-block">
        <h2 class="modern-block__title">连接主机</h2>
        <div class="modern-conn-grid">
          <article v-for="c in connections" :key="c.url" class="modern-conn-card">
            <span class="modern-conn-card__tag">{{ c.tag }}</span>
            <h3 class="modern-conn-card__name">{{ c.name }}</h3>
            <p class="modern-conn-card__url">{{ c.url }}</p>
            <button type="button" class="modern-pill modern-pill--primary modern-conn-card__btn">
              进入控制台
            </button>
          </article>
          <article class="modern-conn-card modern-conn-card--add">
            <span class="modern-conn-card__plus">+</span>
            <span>添加远程主机</span>
          </article>
        </div>
      </section>

      <section class="modern-block">
        <div class="modern-block__head">
          <h2>创意工坊模组</h2>
          <button type="button" class="modern-pill modern-pill--ghost">检查更新</button>
        </div>
        <div class="modern-mod-list">
          <article v-for="m in mods" :key="m.id" class="modern-mod-card">
            <div class="modern-mod-card__icon" aria-hidden="true">M</div>
            <div class="modern-mod-card__body">
              <div class="modern-mod-card__top">
                <h3>{{ m.name }}</h3>
                <span
                  class="modern-tag"
                  :class="m.status === '可更新' ? 'modern-tag--warn' : 'modern-tag--ok'"
                >
                  {{ m.status }}
                </span>
              </div>
              <p class="modern-mod-card__meta">ID {{ m.id }} · {{ m.size }}</p>
            </div>
            <button type="button" class="modern-pill modern-pill--ghost modern-mod-card__action">
              详情
            </button>
          </article>
        </div>
      </section>

      <section class="modern-block modern-block--wizard">
        <h2 class="modern-block__title">首服向导</h2>
        <div class="modern-wizard">
          <div class="modern-wizard__track">
            <div class="modern-wizard__fill" style="width: 66%" />
          </div>
          <div class="modern-wizard__steps">
            <span class="modern-wizard__step modern-wizard__step--done">SteamCMD</span>
            <span class="modern-wizard__step modern-wizard__step--done">专用服务器</span>
            <span class="modern-wizard__step modern-wizard__step--active">创建实例</span>
            <span class="modern-wizard__step">启动</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.modern-demo {
  --md-bg: var(--a3st-bg);
  --md-surface: var(--a3st-bg-panel);
  --md-text: var(--a3st-text);
  --md-muted: var(--a3st-text-muted);
  --md-border: color-mix(in srgb, var(--a3st-border) 55%, transparent);
  --md-accent: #4a7c59;
  --md-accent-2: #0078d4;
  --md-radius: 12px;
  --md-shadow: 0 4px 24px color-mix(in srgb, #000 8%, transparent);
  --md-font: 14px;

  height: 100%;
  overflow: auto;
  font-size: var(--md-font);
  line-height: 1.5;
  color: var(--md-text);
  background: var(--md-bg);
}

[data-theme="dark"] .modern-demo {
  --md-shadow: 0 8px 32px color-mix(in srgb, #000 35%, transparent);
}

.modern-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 28px 32px 32px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--md-accent) 18%, var(--md-bg)) 0%,
    color-mix(in srgb, var(--md-accent-2) 12%, var(--md-bg)) 100%
  );
  border-bottom: 1px solid var(--md-border);
}

.modern-hero__badge {
  display: inline-block;
  padding: 4px 10px;
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--md-accent);
  background: color-mix(in srgb, var(--md-accent) 14%, var(--md-bg));
  border-radius: 999px;
}

.modern-hero__title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 6px;
}

.modern-hero__sub {
  font-size: 14px;
  color: var(--md-muted);
  max-width: 480px;
}

.modern-hero__back {
  font-size: 13px;
  color: var(--md-accent-2);
  text-decoration: none;
  white-space: nowrap;
  padding: 8px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--md-bg) 70%, transparent);
}

.modern-hero__back:hover {
  text-decoration: underline;
}

.modern-body {
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.modern-block {
  background: var(--md-surface);
  border: 1px solid var(--md-border);
  border-radius: var(--md-radius);
  padding: 20px 22px;
  box-shadow: var(--md-shadow);
}

.modern-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.modern-block__head h2,
.modern-block__title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 14px;
}

.modern-block__head h2 {
  margin-bottom: 0;
}

.modern-block__actions {
  display: flex;
  gap: 8px;
}

.modern-pill {
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 999px;
  cursor: default;
  transition: transform 0.12s ease;
}

.modern-pill--primary {
  color: #fff;
  background: linear-gradient(135deg, var(--md-accent) 0%, color-mix(in srgb, var(--md-accent) 80%, #000) 100%);
}

.modern-pill--ghost {
  color: var(--md-text);
  background: color-mix(in srgb, var(--md-text) 6%, transparent);
  border: 1px solid var(--md-border);
}

.modern-stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.modern-stat {
  padding: 16px 18px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--md-bg) 55%, var(--md-surface));
  border: 1px solid var(--md-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modern-stat--green {
  border-top: 3px solid #4a7c59;
}

.modern-stat--blue {
  border-top: 3px solid #0078d4;
}

.modern-stat--amber {
  border-top: 3px solid #c9a227;
}

.modern-stat--slate {
  border-top: 3px solid var(--a3st-text-dim);
}

.modern-stat__label {
  font-size: 12px;
  color: var(--md-muted);
  font-weight: 600;
}

.modern-stat__value {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.modern-stat__sub {
  font-size: 12px;
  color: var(--md-muted);
}

.modern-conn-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.modern-conn-card {
  position: relative;
  padding: 18px 18px 16px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--md-bg) 50%, var(--md-surface));
  border: 1px solid var(--md-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 140px;
}

.modern-conn-card__tag {
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--md-accent-2) 15%, transparent);
  color: var(--md-accent-2);
}

.modern-conn-card__name {
  font-size: 15px;
  font-weight: 700;
  margin-top: 4px;
}

.modern-conn-card__url {
  font-size: 13px;
  font-family: var(--a3st-font-mono);
  color: var(--md-muted);
  flex: 1;
}

.modern-conn-card__btn {
  align-self: flex-start;
  font-size: 12px;
  padding: 6px 14px;
}

.modern-conn-card--add {
  align-items: center;
  justify-content: center;
  border-style: dashed;
  color: var(--md-muted);
  font-weight: 600;
  cursor: default;
}

.modern-conn-card__plus {
  font-size: 28px;
  line-height: 1;
  color: var(--md-accent);
}

.modern-mod-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modern-mod-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--md-bg) 45%, var(--md-surface));
  border: 1px solid var(--md-border);
}

.modern-mod-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(145deg, var(--md-accent), color-mix(in srgb, var(--md-accent) 60%, #000));
  color: #fff;
  font-weight: 800;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modern-mod-card__body {
  flex: 1;
  min-width: 0;
}

.modern-mod-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.modern-mod-card__top h3 {
  font-size: 14px;
  font-weight: 700;
}

.modern-mod-card__meta {
  font-size: 12px;
  color: var(--md-muted);
  margin-top: 2px;
}

.modern-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}

.modern-tag--ok {
  background: color-mix(in srgb, #4a7c59 18%, transparent);
  color: #4a7c59;
}

.modern-tag--warn {
  background: color-mix(in srgb, #c9a227 18%, transparent);
  color: #a67c00;
}

[data-theme="dark"] .modern-tag--ok {
  color: #8fbc8f;
}

[data-theme="dark"] .modern-tag--warn {
  color: #e6c547;
}

.modern-mod-card__action {
  flex-shrink: 0;
  font-size: 12px;
  padding: 6px 12px;
}

.modern-wizard__track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--md-text) 8%, transparent);
  overflow: hidden;
  margin-bottom: 12px;
}

.modern-wizard__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--md-accent), var(--md-accent-2));
}

.modern-wizard__steps {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.modern-wizard__step {
  font-size: 12px;
  font-weight: 600;
  color: var(--md-muted);
}

.modern-wizard__step--done {
  color: var(--md-accent);
}

.modern-wizard__step--active {
  color: var(--md-accent-2);
}

@media (max-width: 860px) {
  .modern-stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .modern-conn-grid {
    grid-template-columns: 1fr;
  }

  .modern-hero {
    flex-direction: column;
    padding: 20px;
  }
}
</style>
