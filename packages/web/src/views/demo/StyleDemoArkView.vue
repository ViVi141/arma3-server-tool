<script setup lang="ts">
/**
 * 方案 C：对齐 ark-ui-skill 的 ark + moderate
 * @see https://github.com/Brandon030722/ark-ui-skill references/recipes.md
 */
const railItems = [
  { index: "01", label: "概览", code: "INDEX", active: true },
  { index: "02", label: "模组", code: "MODS", active: false },
  { index: "03", label: "日志", code: "LOGS", active: false },
  { index: "04", label: "配置", code: "CFG", active: false },
];

const modules = [
  {
    code: "SRV–01",
    title: "CALIBRATE",
    subtitle: "实例状态",
    body: "查看运行、PID、在线人数与端口，确认当前部署窗口可用。",
    action: "打开 Dashboard →",
  },
  {
    code: "SRV–02",
    title: "WORKSHOP",
    subtitle: "模组同步",
    body: "对照远程 Workshop 时间与本地目录，标记可更新项而非堆叠卡片。",
    action: "打开模组页 →",
    dark: true,
  },
  {
    code: "SRV–03",
    title: "DEPLOY",
    subtitle: "首服序列",
    body: "SteamCMD → 专用服务器 → 创建实例 → 写入配置。",
    action: "继续向导 →",
    steps: ["STEAMCMD", "DEDICATED", "INSTANCE", "LAUNCH"],
    stepActive: 2,
  },
];

const connections = [
  { category: "LOCAL", date: "127.0.0.1", headline: "本机 Service · :19580" },
  { category: "LAN", date: "192.168.31.176", headline: "n100 局域网 · :19580" },
];

const mods = [
  { category: "SYNC", date: "2025-08-20", headline: "CBA_A3 · 450814997" },
  { category: "UPDATE", date: "2025-08-25", headline: "ACE3 · 463939057" },
  { category: "SYNC", date: "2025-08-10", headline: "RHS USAF · 843425103" },
];
</script>

<template>
  <div class="ark-ui" data-ark-theme="ark" data-ark-depth="moderate">
    <div class="ark-shell">
      <aside class="ark-rail" aria-label="主导航">
        <button
          v-for="item in railItems"
          :key="item.code"
          type="button"
          class="ark-rail-item"
          :class="{ 'is-active': item.active }"
        >
          <span class="ark-rail-index">{{ item.index }}</span>
          <span>{{ item.label }}</span>
        </button>
        <div class="ark-rail-code">A3ST<br />REV. 2.0</div>
      </aside>

      <div class="ark-main">
        <header class="ark-topbar">
          <div class="ark-wordmark">
            <span class="ark-mark" aria-hidden="true">
              <i /><i /><i />
            </span>
            <span>
              <strong>A3ST / 07</strong>
              <small>ARM3 SERVER TOOLS</small>
            </span>
          </div>
          <p class="ark-top-status">
            <span class="ark-pulse" aria-hidden="true" />
            RELAY ONLINE
          </p>
          <router-link to="/demo" class="ark-top-link">← 方案列表</router-link>
        </header>

        <main class="ark-scroll">
          <!-- Hero：当前操作舞台（ark moderate = 黑边壳 + 一层 blueprint） -->
          <section class="ark-hero" aria-labelledby="ark-hero-title">
            <div class="ark-grid" aria-hidden="true" />
            <div class="ark-art" aria-hidden="true">
              <div class="ark-orbit ark-orbit-a" />
              <div class="ark-orbit ark-orbit-b" />
              <div class="ark-orbit ark-orbit-c" />
              <div class="ark-core"><span /></div>
              <div class="ark-vector ark-vector-a" />
              <div class="ark-vector ark-vector-b" />
            </div>

            <div class="ark-hero-copy">
              <p class="ark-kicker">FIELD OPERATIONS / 服务器运维</p>
              <h1 id="ark-hero-title">
                ALTIS
                <span class="ark-title-outline">OPS</span>
              </h1>
              <p class="ark-lede">
                以舞台承载当前操作，导航与状态贴在边缘。中性面占主体，青色只标记选中与进度——不是满屏终端字。
              </p>
              <div class="ark-actions">
                <button type="button" class="ark-button ark-button-primary">启动服务器</button>
                <button type="button" class="ark-button">写入 server.cfg</button>
              </div>
            </div>

            <aside class="ark-readout" aria-label="实例读数">
              <div class="ark-readout-head">
                <span>RELAY // 07 ACTIVE</span>
                <strong>ONLINE</strong>
              </div>
              <dl>
                <div><dt>在线</dt><dd>12 / 64</dd></div>
                <div><dt>端口</dt><dd>2302</dd></div>
                <div><dt>PID</dt><dd>8842</dd></div>
              </dl>
              <div class="ark-spark" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </div>
            </aside>

            <footer class="ark-hero-footer">
              <span>49° 16′ 40.12″ N NODE / A3ST-07</span>
              <span>D:\Arma3Server · DEMO</span>
            </footer>
          </section>

          <!-- 模块区：operation modules，非 dashboard 卡片网格 -->
          <section class="ark-section" aria-labelledby="ark-modules-title">
            <div class="ark-section-title">
              <p class="ark-kicker">SYSTEM MAP / 02</p>
              <h2 id="ark-modules-title">MODULES</h2>
              <div class="ark-title-rule" />
            </div>

            <div class="ark-module-grid">
              <article
                v-for="mod in modules"
                :key="mod.code"
                class="ark-module"
                :class="{ 'ark-module-dark': mod.dark }"
              >
                <p class="ark-module-code">{{ mod.code }} / {{ mod.title }}</p>
                <h3>{{ mod.subtitle }}</h3>
                <p class="ark-module-body">{{ mod.body }}</p>
                <div v-if="mod.steps" class="ark-module-steps">
                  <span
                    v-for="(step, i) in mod.steps"
                    :key="step"
                    :class="{
                      'is-done': i < mod.stepActive,
                      'is-active': i === mod.stepActive,
                    }"
                  >
                    {{ step }}
                  </span>
                </div>
                <button type="button" class="ark-module-link">{{ mod.action }}</button>
              </article>
            </div>
          </section>

          <!-- 连接：新闻列表式 editorial band，非信号条卡片 -->
          <section class="ark-section ark-section--split" aria-labelledby="ark-operator-title">
            <div class="ark-section-title">
              <p class="ark-kicker">OPERATOR / 03</p>
              <h2 id="ark-operator-title">NODES</h2>
              <div class="ark-title-rule" />
            </div>

            <ul class="ark-archive">
              <li v-for="c in connections" :key="c.headline">
                <span class="ark-archive__cat">{{ c.category }}</span>
                <span class="ark-archive__date">{{ c.date }}</span>
                <span class="ark-archive__headline">{{ c.headline }}</span>
                <button type="button" class="ark-archive__action">LINK →</button>
              </li>
            </ul>
          </section>

          <!-- 模组：archive list，非 dense table -->
          <section class="ark-section" aria-labelledby="ark-media-title">
            <div class="ark-section-title">
              <p class="ark-kicker">WORKSHOP / 04</p>
              <h2 id="ark-media-title">ARCHIVE</h2>
              <div class="ark-title-rule" />
            </div>

            <ul class="ark-archive">
              <li v-for="m in mods" :key="m.headline">
                <span
                  class="ark-archive__cat"
                  :class="{ 'ark-archive__cat--warn': m.category === 'UPDATE' }"
                >
                  {{ m.category }}
                </span>
                <span class="ark-archive__date">{{ m.date }}</span>
                <span class="ark-archive__headline">{{ m.headline }}</span>
              </li>
            </ul>
          </section>

          <footer class="ark-page-footer">
            A3ST — FICTIONAL DEMONSTRATION · 对齐
            <a
              href="https://github.com/Brandon030722/ark-ui-skill"
              target="_blank"
              rel="noopener noreferrer"
            >ark-ui-skill</a>
            · NO OFFICIAL AFFILIATION
          </footer>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ark-ui {
  --ark-ink: #080a0b;
  --ark-paper: #f4f6f6;
  --ark-signal: #18d1ff;
  --ark-state: #c8eb21;
  --ark-muted: #8d9396;
  --ark-panel: rgb(8 10 11 / 82%);
  --ark-rule: rgb(8 10 11 / 24%);
  --ark-paper-rule: rgb(255 255 255 / 22%);
  --ark-display: "Arial Narrow", "Roboto Condensed", "DIN Condensed", sans-serif;
  --ark-ui: "Segoe UI", "Microsoft YaHei UI", "IBM Plex Sans", system-ui, sans-serif;
  --ark-mono: "Cascadia Mono", "IBM Plex Mono", Consolas, monospace;
  --ark-direct: 240ms;
  --ark-ease: cubic-bezier(0.22, 0.8, 0.2, 1);
  --ark-depth-grid-opacity: 0.38;
  --ark-depth-art-opacity: 0.58;
  --ark-depth-readout-shadow: 0.35rem 0.35rem 0 color-mix(in srgb, var(--ark-signal), transparent 64%);

  height: 100%;
  overflow: hidden;
  font-family: var(--ark-ui);
  color: var(--ark-ink);
  background: var(--ark-paper);
}

.ark-shell {
  height: 100%;
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.ark-rail {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  background: var(--ark-paper);
  border-right: 1px solid var(--ark-rule);
  overflow: hidden;
}

.ark-rail-item {
  position: relative;
  min-height: 5.5rem;
  padding: 0.75rem 0.5rem;
  border: 0;
  border-bottom: 1px solid var(--ark-rule);
  background: transparent;
  color: var(--ark-muted);
  cursor: default;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: left;
  writing-mode: vertical-rl;
  text-transform: uppercase;
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  font-family: inherit;
}

.ark-rail-item::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 0.28rem;
  background: var(--ark-signal);
  transform: scaleY(0);
  transform-origin: bottom;
  transition: transform var(--ark-direct) var(--ark-ease);
}

.ark-rail-item.is-active {
  background: var(--ark-ink);
  color: #fff;
}

.ark-rail-item.is-active::before {
  transform: scaleY(1);
}

.ark-rail-index {
  font-family: var(--ark-mono);
  color: var(--ark-signal);
  writing-mode: horizontal-tb;
}

.ark-rail-code {
  margin-top: auto;
  padding: 1rem 0.6rem;
  color: var(--ark-muted);
  font-family: var(--ark-mono);
  font-size: 0.58rem;
  line-height: 1.55;
}

.ark-main {
  grid-column: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ark-topbar {
  flex-shrink: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1.25rem;
  height: 4.5rem;
  border-bottom: 1px solid rgb(255 255 255 / 16%);
  background: var(--ark-panel);
  color: #fff;
  backdrop-filter: blur(0.65rem);
}

.ark-wordmark {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.ark-wordmark strong,
.ark-wordmark small {
  display: block;
}

.ark-wordmark strong {
  font-family: var(--ark-display);
  font-size: 1.35rem;
  line-height: 0.9;
  letter-spacing: -0.04em;
}

.ark-wordmark small {
  margin-top: 0.28rem;
  color: rgb(255 255 255 / 65%);
  font-family: var(--ark-mono);
  font-size: 0.57rem;
  letter-spacing: 0.14em;
}

.ark-mark {
  position: relative;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  color: var(--ark-signal);
}

.ark-mark i {
  position: absolute;
  width: 1.65rem;
  height: 2px;
  background: currentColor;
  transform-origin: center;
}

.ark-mark i:nth-child(1) {
  transform: rotate(0deg);
}

.ark-mark i:nth-child(2) {
  transform: rotate(60deg);
}

.ark-mark i:nth-child(3) {
  transform: rotate(-60deg);
}

.ark-top-status {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  font-family: var(--ark-mono);
  font-size: 0.67rem;
  letter-spacing: 0.12em;
}

.ark-pulse {
  width: 0.5rem;
  height: 0.5rem;
  background: var(--ark-state);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--ark-state), transparent 55%);
  animation: ark-pulse 1.8s ease-out infinite;
}

@keyframes ark-pulse {
  70%,
  100% {
    box-shadow: 0 0 0 0.55rem transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ark-pulse {
    animation: none;
  }
}

.ark-top-link {
  font-family: var(--ark-mono);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--ark-signal);
  text-decoration: none;
  white-space: nowrap;
}

.ark-top-link:hover {
  text-decoration: underline;
}

.ark-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.ark-hero {
  position: relative;
  min-height: min(92vh, 42rem);
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 22rem);
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: end;
  gap: 2rem;
  padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4rem) 3.5rem;
  color: var(--ark-paper);
  background:
    linear-gradient(90deg, rgb(8 10 11 / 98%) 0 44%, rgb(8 10 11 / 64%) 70%, rgb(8 10 11 / 92%)),
    linear-gradient(145deg, #1d1f20, #080a0b 62%);
  isolation: isolate;
}

.ark-grid {
  position: absolute;
  inset: 0;
  z-index: -4;
  opacity: var(--ark-depth-grid-opacity);
  background-image:
    linear-gradient(rgb(24 209 255 / 15%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 10%) 1px, transparent 1px);
  background-size: clamp(3rem, 6vw, 5rem) clamp(3rem, 6vw, 5rem);
  mask-image: linear-gradient(90deg, #000, #000 68%, transparent 95%);
}

.ark-art {
  position: absolute;
  z-index: -3;
  inset: 3% -4% 0 28%;
  color: var(--ark-paper);
  opacity: var(--ark-depth-art-opacity);
  mix-blend-mode: screen;
}

.ark-art::before,
.ark-art::after {
  content: "";
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--ark-paper), transparent 38%);
  transform: rotate(-13deg);
}

.ark-art::before {
  inset: 21% 14% 15% 13%;
}

.ark-art::after {
  inset: 30% 6% 4% 30%;
  border-color: var(--ark-signal);
}

.ark-orbit {
  position: absolute;
  border: 1px solid currentColor;
  border-radius: 50%;
  transform: rotate(-18deg);
}

.ark-orbit::before,
.ark-orbit::after {
  content: "";
  position: absolute;
  width: 0.6rem;
  height: 0.6rem;
  background: var(--ark-signal);
}

.ark-orbit::before {
  top: 10%;
  left: 18%;
}

.ark-orbit::after {
  right: 8%;
  bottom: 26%;
}

.ark-orbit-a {
  width: min(54vw, 36rem);
  aspect-ratio: 1;
  right: 9%;
  top: 7%;
}

.ark-orbit-b {
  width: min(38vw, 26rem);
  aspect-ratio: 1;
  right: 17%;
  top: 19%;
  border-style: dashed;
}

.ark-orbit-c {
  width: min(21vw, 14rem);
  aspect-ratio: 1;
  right: 27%;
  top: 35%;
  border-width: 2px;
}

.ark-core {
  position: absolute;
  right: 34%;
  top: 42%;
  width: clamp(4rem, 8vw, 8rem);
  aspect-ratio: 1;
  background: var(--ark-paper);
  clip-path: polygon(50% 0, 100% 29%, 82% 100%, 18% 100%, 0 29%);
  transform: rotate(18deg);
}

.ark-core::before,
.ark-core::after,
.ark-core span {
  content: "";
  position: absolute;
  inset: 22%;
  border: 1px solid var(--ark-signal);
  transform: rotate(32deg);
}

.ark-core::after {
  inset: 35%;
  transform: rotate(-18deg);
}

.ark-core span {
  inset: 46%;
  background: var(--ark-signal);
}

.ark-vector {
  position: absolute;
  height: 1px;
  background: currentColor;
  transform-origin: left center;
}

.ark-vector::after {
  content: "";
  position: absolute;
  right: 0;
  top: -0.28rem;
  width: 0.55rem;
  height: 0.55rem;
  border: 1px solid currentColor;
  transform: rotate(45deg);
}

.ark-vector-a {
  width: 48%;
  top: 28%;
  left: 8%;
  transform: rotate(11deg);
}

.ark-vector-b {
  width: 42%;
  bottom: 22%;
  left: 28%;
  transform: rotate(-24deg);
}

.ark-hero-copy {
  max-width: 36rem;
}

.ark-kicker,
.ark-module-code {
  margin: 0 0 1rem;
  font-family: var(--ark-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.ark-kicker::before,
.ark-module-code::before {
  content: "";
  display: inline-block;
  width: 1.8rem;
  height: 0.38rem;
  margin-right: 0.6rem;
  background: var(--ark-signal);
  vertical-align: 0.04rem;
}

.ark-hero h1 {
  margin: 0;
  max-width: 10ch;
  font-family: var(--ark-display);
  font-size: clamp(3.5rem, 10vw, 8rem);
  font-stretch: condensed;
  font-weight: 900;
  line-height: 0.78;
  letter-spacing: -0.075em;
  text-transform: uppercase;
}

.ark-title-outline {
  color: transparent;
  -webkit-text-stroke: 1px var(--ark-paper);
}

.ark-lede {
  max-width: 32rem;
  margin: 1.25rem 0 0;
  font-size: 0.95rem;
  line-height: 1.65;
  color: rgb(255 255 255 / 78%);
}

.ark-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.75rem;
}

.ark-button {
  position: relative;
  display: inline-flex;
  min-height: 2.6rem;
  align-items: center;
  padding: 0.65rem 1rem 0.65rem 1.85rem;
  border: 1px solid var(--ark-paper);
  background: transparent;
  color: var(--ark-paper);
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: default;
}

.ark-button::before {
  content: "";
  position: absolute;
  left: 0.75rem;
  width: 0.38rem;
  height: 56%;
  background: var(--ark-signal);
  clip-path: polygon(0 0, 45% 0, 45% 100%, 0 100%);
}

.ark-button-primary {
  background: var(--ark-paper);
  color: var(--ark-ink);
}

.ark-readout {
  align-self: end;
  padding: 1rem;
  border: 1px solid rgb(255 255 255 / 54%);
  background: var(--ark-panel);
  color: var(--ark-paper);
  box-shadow: var(--ark-depth-readout-shadow);
}

.ark-readout-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgb(255 255 255 / 18%);
  font-family: var(--ark-mono);
  font-size: 0.7rem;
}

.ark-readout-head strong {
  color: var(--ark-state);
}

.ark-readout dl {
  margin: 0.5rem 0;
}

.ark-readout dl div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
}

.ark-readout dt {
  color: rgb(255 255 255 / 66%);
  font-size: 0.75rem;
}

.ark-readout dd {
  margin: 0;
  font: 700 1rem var(--ark-mono);
}

.ark-spark {
  height: 3.5rem;
  display: flex;
  align-items: end;
  gap: 0.35rem;
  padding-top: 0.7rem;
  border-top: 1px solid rgb(255 255 255 / 18%);
}

.ark-spark i {
  flex: 1;
  background: rgb(255 255 255 / 28%);
  min-height: 8%;
}

.ark-spark i:nth-child(1) {
  height: 18%;
}

.ark-spark i:nth-child(2) {
  height: 42%;
}

.ark-spark i:nth-child(3) {
  height: 30%;
}

.ark-spark i:nth-child(4) {
  height: 74%;
  background: var(--ark-paper);
}

.ark-spark i:nth-child(5) {
  height: 55%;
}

.ark-spark i:nth-child(6) {
  height: 84%;
}

.ark-spark i:nth-child(7) {
  height: 61%;
  background: var(--ark-signal);
}

.ark-spark i:nth-child(8) {
  height: 96%;
}

.ark-hero-footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgb(255 255 255 / 18%);
  font-family: var(--ark-mono);
  font-size: 0.58rem;
  letter-spacing: 0.09em;
  color: rgb(255 255 255 / 58%);
}

.ark-section {
  padding: clamp(2.5rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4rem);
  background: var(--ark-paper);
  border-top: 1px solid var(--ark-rule);
}

.ark-section-title {
  display: grid;
  grid-template-columns: auto minmax(4rem, 1fr);
  align-items: end;
  column-gap: 1.5rem;
  margin-bottom: clamp(1.5rem, 4vw, 3rem);
}

.ark-section-title .ark-kicker {
  grid-column: 1 / -1;
}

.ark-section-title h2 {
  margin: 0;
  max-width: 12ch;
  font-family: var(--ark-display);
  font-size: clamp(2.5rem, 6vw, 5rem);
  font-weight: 900;
  line-height: 0.84;
  letter-spacing: -0.065em;
  text-transform: uppercase;
}

.ark-title-rule {
  height: 1px;
  background: var(--ark-ink);
  margin-bottom: 0.4rem;
}

.ark-module-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--ark-rule);
  border: 1px solid var(--ark-rule);
}

.ark-module {
  min-height: 18rem;
  display: flex;
  flex-direction: column;
  padding: clamp(1.2rem, 3vw, 2rem);
  background: var(--ark-paper);
}

.ark-module-dark {
  background: var(--ark-ink);
  color: #fff;
}

.ark-module h3 {
  margin: 0 0 0.75rem;
  font-family: var(--ark-display);
  font-size: 1.75rem;
  line-height: 0.95;
  letter-spacing: -0.03em;
  text-transform: uppercase;
}

.ark-module-body {
  flex: 1;
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--ark-muted);
}

.ark-module-dark .ark-module-body {
  color: rgb(255 255 255 / 68%);
}

.ark-module-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.75rem 0;
}

.ark-module-steps span {
  padding: 0.2rem 0.45rem;
  font-family: var(--ark-mono);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  border: 1px solid var(--ark-rule);
  color: var(--ark-muted);
}

.ark-module-steps .is-done {
  border-color: var(--ark-signal);
  color: var(--ark-ink);
}

.ark-module-steps .is-active {
  background: var(--ark-signal);
  border-color: var(--ark-signal);
  color: var(--ark-ink);
  font-weight: 700;
}

.ark-module-dark .ark-module-steps span {
  border-color: rgb(255 255 255 / 22%);
  color: rgb(255 255 255 / 55%);
}

.ark-module-dark .ark-module-steps .is-active {
  color: var(--ark-ink);
}

.ark-module-link {
  align-self: flex-start;
  margin-top: 0.75rem;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-family: var(--ark-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--ark-ink);
  cursor: default;
  text-align: left;
}

.ark-module-dark .ark-module-link {
  color: var(--ark-signal);
}

.ark-archive {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--ark-rule);
}

.ark-archive li {
  display: grid;
  grid-template-columns: 5rem 8rem minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid var(--ark-rule);
}

.ark-archive__cat {
  font-family: var(--ark-mono);
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  color: var(--ark-signal);
}

.ark-archive__cat--warn {
  color: color-mix(in srgb, var(--ark-ink), #c9a227 55%);
}

.ark-archive__date {
  font-family: var(--ark-mono);
  font-size: 0.72rem;
  color: var(--ark-muted);
}

.ark-archive__headline {
  font-size: 1rem;
  font-weight: 600;
}

.ark-archive__action {
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--ark-ink);
  background: transparent;
  font: inherit;
  font-family: var(--ark-mono);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  cursor: default;
}

.ark-page-footer {
  padding: 1.25rem clamp(1.25rem, 5vw, 4rem) 2rem;
  background: var(--ark-ink);
  color: rgb(255 255 255 / 55%);
  font-family: var(--ark-mono);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
}

.ark-page-footer a {
  color: var(--ark-signal);
}

@media (max-width: 900px) {
  .ark-shell {
    grid-template-columns: 1fr;
  }

  .ark-rail {
    flex-direction: row;
    border-right: 0;
    border-bottom: 1px solid var(--ark-rule);
    overflow-x: auto;
  }

  .ark-rail-item {
    min-height: auto;
    min-width: 4.5rem;
    writing-mode: horizontal-tb;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.65rem 0.5rem;
  }

  .ark-rail-code {
    display: none;
  }

  .ark-hero {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .ark-module-grid {
    grid-template-columns: 1fr;
  }

  .ark-archive li {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }
}
</style>
