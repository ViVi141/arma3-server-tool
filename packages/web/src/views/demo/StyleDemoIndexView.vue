<script setup lang="ts">
const schemes = [
  {
    id: "refined",
    route: "/demo/refined",
    title: "方案 A · 精修工具风",
    tagline: "保留 VS Code 运维感，只做可读性与层次微调",
    bullets: [
      "字号 12→13px，行高与卡片内边距略增",
      "Dashboard 用带左侧色条的 stat 卡片 + 分组 toolbar",
      "连接页改为卡片列表；模组表保留密度但列分组",
      "仍无大圆角、无阴影，兼容长时间盯屏",
    ],
  },
  {
    id: "modern",
    route: "/demo/modern",
    title: "方案 B · 现代 Web 风",
    tagline: "卡片化、留白与品牌色，偏产品控制台",
    bullets: [
      "圆角 12px、轻阴影、渐变顶栏与橄榄绿点缀",
      "大字号与 pill 按钮，信息按「概览 / 详情」分层",
      "连接与模组以卡片网格呈现，弱化 fieldset 表单感",
      "适合对外展示；运维页信息密度会略降",
    ],
  },
  {
    id: "ark",
    route: "/demo/ark",
    title: "方案 C · ark 工业信息风",
    tagline: "对齐 ark-ui-skill · ark + moderate",
    bullets: [
      "舞台 + 边缘仪表：大标题 Hero + 侧栏读数，非满屏 HUD",
      "近黑/米白中性面 + 信号色 #18d1ff，绿仅用于 ONLINE 状态",
      "竖排索引导航、模块三分区、列表式 archive（非卡片网格）",
      "参考官方 starter-vanilla 构图，适配 A3ST 运维语义",
    ],
    linkClass: "scheme-card__link--ark",
  },
];
</script>

<template>
  <div class="demo-index">
    <header class="demo-index__hero">
      <p class="demo-index__eyebrow">UI 风格探索 · 仅演示，未接入真实数据</p>
      <h1 class="demo-index__title">三种改版方向预览</h1>
      <p class="demo-index__desc">
        下方各入口打开独立演示页，可用顶栏「外观」切换明暗主题对比效果。
      </p>
      <router-link to="/connections" class="demo-index__back">← 返回连接页</router-link>
    </header>

    <div class="demo-index__grid">
      <article v-for="item in schemes" :key="item.id" class="scheme-card">
        <h2 class="scheme-card__title">{{ item.title }}</h2>
        <p class="scheme-card__tagline">{{ item.tagline }}</p>
        <ul class="scheme-card__list">
          <li v-for="(line, i) in item.bullets" :key="i">{{ line }}</li>
        </ul>
        <router-link :to="item.route" class="scheme-card__link" :class="item.linkClass">
          打开演示页
        </router-link>
      </article>
    </div>
  </div>
</template>

<style scoped>
.demo-index {
  height: 100%;
  overflow: auto;
  padding: 24px 28px 40px;
  background: var(--a3st-bg);
}

.demo-index__hero {
  max-width: 720px;
  margin-bottom: 28px;
}

.demo-index__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--a3st-text-dim);
  margin-bottom: 8px;
}

.demo-index__title {
  font-size: 22px;
  font-weight: 600;
  color: var(--a3st-text);
  margin-bottom: 8px;
}

.demo-index__desc {
  font-size: 13px;
  line-height: 1.55;
  color: var(--a3st-text-muted);
  margin-bottom: 12px;
}

.demo-index__back {
  font-size: 12px;
  color: var(--a3st-accent);
  text-decoration: none;
}

.demo-index__back:hover {
  text-decoration: underline;
}

.demo-index__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  max-width: 1200px;
}

.scheme-card {
  border: 1px solid var(--a3st-border-subtle);
  background: var(--a3st-bg-panel);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scheme-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--a3st-text);
}

.scheme-card__tagline {
  font-size: 13px;
  color: var(--a3st-text-muted);
  line-height: 1.45;
}

.scheme-card__list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--a3st-text-muted);
  flex: 1;
}

.scheme-card__link {
  display: inline-block;
  margin-top: 4px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  color: #fff;
  background: var(--a3st-accent);
  border-radius: 2px;
  align-self: flex-start;
}

.scheme-card__link:hover {
  background: var(--a3st-accent-hover);
}

.scheme-card__link--ark {
  background: #080a0b;
  border: 1px solid #18d1ff;
}

.scheme-card__link--ark:hover {
  background: #18d1ff;
  color: #080a0b;
}

@media (max-width: 960px) {
  .demo-index__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .demo-index__grid {
    grid-template-columns: 1fr;
  }
}
</style>
