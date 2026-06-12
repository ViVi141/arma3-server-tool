<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { useConnectionsStore } from "@/stores/connections";
import TerminalOutput from "@/components/TerminalOutput.vue";

const store = useConnectionsStore();
const baseUrl = ref(store.active?.baseUrl ?? "");

const props = defineProps<{ connectionId: string; serverUuid: string; initialTab?: string }>();
const activeTab = ref(props.initialTab ?? "basic");
const rawConfig = ref<Record<string, unknown>>({});
const loading = ref(false);
const saving = ref(false);

// Editable fields
const sections = computed(() => ({
  server: (rawConfig.value.server ?? {}) as Record<string, unknown>,
  startup: (rawConfig.value.startup ?? {}) as Record<string, unknown>,
  basic: (rawConfig.value.basic ?? {}) as Record<string, unknown>,
  battleye: (rawConfig.value.battleye ?? {}) as Record<string, unknown>,
  mods: (rawConfig.value.mods ?? {}) as Record<string, unknown>,
  tasks: (rawConfig.value.tasks ?? {}) as Record<string, unknown>,
  monitoring: (rawConfig.value.monitoring ?? {}) as Record<string, unknown>,
  scheduler: (rawConfig.value.scheduler ?? {}) as Record<string, unknown>,
}));

onMounted(loadConfig);

async function loadConfig() {
  loading.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const res = await client.getConfig(props.serverUuid);
    if (res.success) rawConfig.value = res.data as Record<string, unknown>;
  } finally { loading.value = false; }
}

async function writeCfg() {
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: "write_cfg" as const }] });
    ElMessage.success("配置已写入服务器目录");
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "写入失败"); }
  finally { saving.value = false; }
}

async function saveSection(section: string) {
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    const patch: Record<string, unknown> = {};
    patch[section] = sections.value[section as keyof typeof sections.value];
    await client.patchConfig(props.serverUuid, patch as never);
    ElMessage.success(`${section} 已保存`);
    await loadConfig();
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); }
  finally { saving.value = false; }
}

async function doAction(action: string) {
  try {
    const client = store.getClient();
    if (!client) return;
    await client.submitTask({ serverUuid: props.serverUuid, commands: [{ action: action as never }] });
    ElMessage.success(`${action} 执行成功`);
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "执行失败"); }
}

const newMission = ref({ template: "", difficulty: 3 });
async function addMission() {
  if (!newMission.value.template) return;
  const list = (sections.value.missions as unknown[] ?? []) as { template: string; difficulty?: number }[];
  list.push({ ...newMission.value });
  saving.value = true;
  try {
    const client = store.getClient();
    if (!client) return;
    await client.patchConfig(props.serverUuid, { missions: list } as never);
    newMission.value = { template: "", difficulty: 3 };
    await loadConfig();
    ElMessage.success("任务已添加");
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "添加失败"); }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="config-page">
    <h2>服务器配置</h2>

    <div style="margin: 12px 0; display: flex; gap: 8px; flex-wrap: wrap;">
      <el-button type="primary" :loading="saving" @click="writeCfg">写入服务器目录</el-button>
      <el-button @click="doAction('save')">保存配置包</el-button>
      <el-button @click="doAction('preflight')">开服体检</el-button>
      <el-button @click="loadConfig">刷新</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="基本" name="basic">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="配置名称">
            <el-input v-model="sections.server.configName" />
          </el-form-item>
          <el-form-item label="服务器目录">
            <el-input v-model="sections.server.serverDir" placeholder="C:\arma3" />
          </el-form-item>
          <el-form-item label="可执行文件">
            <el-input v-model="sections.server.executable" placeholder="arma3server_x64.exe" />
          </el-form-item>
          <el-form-item label="模组目录">
            <el-input v-model="sections.server.modDir" placeholder="可留空使用默认" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('server')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="启动参数" name="startup">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="启动参数">
            <el-input v-model="sections.startup.parameters" type="textarea" :rows="3" placeholder="-world=empty -cpuCount=4" />
          </el-form-item>
          <el-form-item label="崩溃重启">
            <el-switch v-model="sections.startup.restartOnCrash" />
          </el-form-item>
          <el-form-item label="延迟启动(秒)">
            <el-input-number v-model="sections.startup.startupDelay" :min="0" :max="60" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('startup')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="性能" name="performance">
        <div v-loading="loading" style="max-height: 600px; overflow-y: auto;">
          <el-form label-width="180px" style="padding: 4px;">
            <h4>CPU / 内存</h4>
            <el-form-item label="CPU 核心数"><el-input-number v-model="sections.startup.cpuCount" :min="0" :max="128" /></el-form-item>
            <el-form-item label="额外线程"><el-input-number v-model="sections.startup.exThreads" :min="0" :max="32" /></el-form-item>
            <el-form-item label="最大内存(MB)"><el-input-number v-model="sections.startup.maxMem" :min="0" :max="65536" /></el-form-item>
            <el-form-item label="帧率上限"><el-input-number v-model="sections.startup.limitFps" :min="1" :max="1000" /></el-form-item>
            <el-divider />
            <h4>画面</h4>
            <el-form-item label="视距"><el-input-number v-model="sections.startup.viewDistance" :min="200" :max="10000" /></el-form-item>
            <el-form-item label="地形网格"><el-input-number v-model="sections.startup.terrainGrid" :min="1" :max="50" /></el-form-item>
            <el-divider />
            <h4>高级</h4>
            <el-form-item label="超线程"><el-switch v-model="sections.startup.enableHT" /></el-form-item>
            <el-form-item label="大页内存"><el-switch v-model="sections.startup.hugepages" /></el-form-item>
            <el-form-item label="任务预加载"><el-switch v-model="sections.startup.loadMissionToMemory" /></el-form-item>
            <el-form-item label="禁用服务端线程"><el-switch v-model="sections.startup.disableServerThread" /></el-form-item>
            <el-form-item style="margin-top: 12px;">
              <el-button type="primary" :loading="saving" @click="saveSection('startup')">保存</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="网络" name="network">
        <div v-loading="loading" style="max-height: 600px; overflow-y: auto;">
          <el-form label-width="180px" style="padding: 4px;">
            <h4>简易设置</h4>
            <el-form-item label="上行带宽(Mbps)"><el-input-number v-model="sections.startup.uploadMbps" :min="1" :max="10000" /></el-form-item>
            <el-divider />
            <h4>专业设置 (basic.cfg)</h4>
            <el-form-item label="MaxMsgSend"><el-input-number v-model="sections.basic.maxMsgSend" :min="64" :max="512" /></el-form-item>
            <el-form-item label="MaxSizeGuaranteed"><el-input-number v-model="sections.basic.maxSizeGuaranteed" :min="128" :max="1024" /></el-form-item>
            <el-form-item label="MaxSizeNonguaranteed"><el-input-number v-model="sections.basic.maxSizeNonguaranteed" :min="64" :max="512" /></el-form-item>
            <el-form-item label="MinBandwidth"><el-input-number v-model="sections.basic.minBandwidth" :min="16384" :max="1048576" /></el-form-item>
            <el-form-item label="MaxBandwidth"><el-input-number v-model="sections.basic.maxBandwidth" :min="131072" :max="10485760" /></el-form-item>
            <el-form-item label="MaxPacketSize"><el-input-number v-model="sections.basic.maxPacketSize" :min="500" :max="2000" /></el-form-item>
            <el-form-item label="MaxCustomFileSize"><el-input-number v-model="sections.basic.maxCustomFileSize" :min="0" :max="100" /></el-form-item>
            <el-form-item label="MinErrorToSend"><el-input-number v-model="sections.basic.minErrorToSend" :min="0" :max="1" :step="0.001" /></el-form-item>
            <el-form-item label="MinErrorToSendNear"><el-input-number v-model="sections.basic.minErrorToSendNear" :min="0" :max="1" :step="0.001" /></el-form-item>
            <el-form-item label="UPnP"><el-switch v-model="sections.basic.upnp" /></el-form-item>
            <el-form-item style="margin-top: 12px;">
              <el-button type="primary" :loading="saving" @click="saveSection('basic')">保存</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="难度" name="difficulty">
        <div v-loading="loading" style="max-height: 600px; overflow-y: auto;">
          <el-form label-width="180px" style="padding: 4px;">
            <h4>界面</h4>
            <el-form-item label="小队指示器"><el-select v-model="sections.basic.groupIndicators"><el-option value="0" label="从不" /><el-option value="1" label="有限距离" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="友军标签"><el-select v-model="sections.basic.friendlyTags"><el-option value="0" label="从不" /><el-option value="1" label="有限距离" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="敌军标签"><el-select v-model="sections.basic.enemyTags"><el-option value="0" label="从不" /><el-option value="1" label="有限距离" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="已发现地雷"><el-select v-model="sections.basic.detectedMines"><el-option value="0" label="从不" /><el-option value="1" label="有限距离" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="武器信息"><el-select v-model="sections.basic.weaponInfo"><el-option value="0" label="从不" /><el-option value="1" label="渐隐" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="姿态指示器"><el-select v-model="sections.basic.stanceIndicator"><el-option value="0" label="从不" /><el-option value="1" label="渐隐" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="命令显示"><el-select v-model="sections.basic.commands"><el-option value="0" label="从不" /><el-option value="1" label="渐隐" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="航点显示"><el-select v-model="sections.basic.waypoints"><el-option value="0" label="从不" /><el-option value="1" label="渐隐" /><el-option value="2" label="始终" /></el-select></el-form-item>
            <el-form-item label="第三人称"><el-select v-model="sections.basic.thirdPerson"><el-option value="0" label="禁用" /><el-option value="1" label="启用" /><el-option value="2" label="仅载具" /></el-select></el-form-item>
            <el-divider />
            <h4>开关</h4>
            <el-form-item label="战术标记"><el-switch v-model="sections.basic.tacticalPing" /></el-form-item>
            <el-form-item label="体力条"><el-switch v-model="sections.basic.staminaBar" /></el-form-item>
            <el-form-item label="准星"><el-switch v-model="sections.basic.weaponCrosshair" /></el-form-item>
            <el-form-item label="视觉辅助"><el-switch v-model="sections.basic.visionAid" /></el-form-item>
            <el-form-item label="镜头震动"><el-switch v-model="sections.basic.cameraShake" /></el-form-item>
            <el-form-item label="得分表"><el-switch v-model="sections.basic.scoreTable" /></el-form-item>
            <el-form-item label="死亡消息"><el-switch v-model="sections.basic.deathMessages" /></el-form-item>
            <el-form-item label="地图内容"><el-switch v-model="sections.basic.mapContent" /></el-form-item>
            <el-form-item label="地图-友军"><el-switch v-model="sections.basic.mapContentFriendly" /></el-form-item>
            <el-form-item label="地图-敌军"><el-switch v-model="sections.basic.mapContentEnemy" /></el-form-item>
            <el-form-item label="地图-地雷"><el-switch v-model="sections.basic.mapContentMines" /></el-form-item>
            <el-form-item label="减少伤害"><el-switch v-model="sections.basic.reducedDamage" /></el-form-item>
            <el-divider />
            <h4>AI</h4>
            <el-form-item label="AI 技能"><el-input-number v-model="sections.basic.skillAi" :min="0" :max="1" :step="0.1" /></el-form-item>
            <el-form-item label="AI 精度"><el-input-number v-model="sections.basic.precisionAi" :min="0" :max="1" :step="0.1" /></el-form-item>
            <el-form-item style="margin-top: 12px;">
              <el-button type="primary" :loading="saving" @click="saveSection('basic')">保存</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="安全" name="security">
        <div v-loading="loading" style="max-height: 600px; overflow-y: auto;">
          <el-form label-width="180px" style="padding: 4px;">
            <h4>密码 / 管理员</h4>
            <el-form-item label="Server Cmd 密码"><el-input v-model="sections.basic.serverCommandPassword" type="password" show-password /></el-form-item>
            <el-form-item label="管理员列表(UID)"><el-input v-model="sections.basic.admins" type="textarea" :rows="2" placeholder="每行一个 Steam64 ID" /></el-form-item>
            <el-form-item label="双ID检测"><el-input v-model="sections.basic.doubleIdDetected" placeholder="动作: kick/ban" /></el-form-item>
            <el-divider />
            <h4>文件安全</h4>
            <el-form-item label="允许文件修补"><el-select v-model="sections.basic.allowedFilePatching">
              <el-option :value="0" label="禁止" /><el-option :value="1" label="客户端" /><el-option :value="2" label="所有人" />
            </el-select></el-form-item>
            <el-form-item label="例外(逗号分隔)"><el-input v-model="sections.basic.filePatchingExceptions" placeholder="7656119...,7656119..." /></el-form-item>
            <el-form-item label="允许加载文件"><el-input v-model="sections.basic.allowedLoadFile" /></el-form-item>
            <el-form-item label="允许预处理"><el-input v-model="sections.basic.allowedPreprocess" /></el-form-item>
            <el-divider />
            <h4>载具 / 创建限制</h4>
            <el-form-item label="最大创建载具数"><el-input-number v-model="sections.basic.maxCreateVehicleCount" :min="0" :max="1000" /></el-form-item>
            <el-form-item label="创建秒数窗口"><el-input-number v-model="sections.basic.maxCreateVehicleSeconds" :min="0" :max="999" /></el-form-item>
            <el-form-item label="最大 SetPos 数"><el-input-number v-model="sections.basic.maxSetPosCount" :min="0" :max="1000" /></el-form-item>
            <el-form-item label="SetPos 秒数窗口"><el-input-number v-model="sections.basic.maxSetPosSeconds" :min="0" :max="999" /></el-form-item>
            <el-divider />
            <h4>事件回调</h4>
            <el-form-item label="玩家进入"><el-input v-model="sections.basic.onUserConnected" placeholder="[]" /></el-form-item>
            <el-form-item label="玩家离开"><el-input v-model="sections.basic.onUserDisconnected" placeholder="[]" /></el-form-item>
            <el-form-item label="玩家被踢"><el-input v-model="sections.basic.onUserKicked" placeholder="[]" /></el-form-item>
            <el-form-item label="篡改数据"><el-input v-model="sections.basic.onHackedData" placeholder="[]" /></el-form-item>
            <el-form-item label="不同数据"><el-input v-model="sections.basic.onDifferentData" placeholder="[]" /></el-form-item>
            <el-form-item label="未签名数据"><el-input v-model="sections.basic.onUnsignedData" placeholder="[]" /></el-form-item>
            <el-form-item style="margin-top: 12px;">
              <el-button type="primary" :loading="saving" @click="saveSection('basic')">保存</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="日志" name="log">
        <div v-loading="loading" style="max-height: 600px; overflow-y: auto;">
          <el-form label-width="180px" style="padding: 4px;">
            <el-form-item label="禁用 RPT"><el-switch v-model="sections.basic.noLogs" /></el-form-item>
            <el-form-item label="网络日志"><el-switch v-model="sections.basic.netLog" /></el-form-item>
            <el-form-item label="日志文件"><el-input v-model="sections.basic.logFile" placeholder="server_console.log" /></el-form-item>
            <el-form-item label="时间戳格式"><el-select v-model="sections.basic.timeStampFormat">
              <el-option :value="0" label="无" /><el-option :value="1" label="简短" /><el-option :value="2" label="完整" />
            </el-select></el-form-item>
            <el-form-item label="扩展调用上限"><el-input-number v-model="sections.basic.callExtReportLimit" :min="1" :max="60000" /></el-form-item>
            <el-form-item style="margin-top: 12px;">
              <el-button type="primary" :loading="saving" @click="saveSection('basic')">保存</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="服务器设置" name="basic_settings">
        <div v-loading="loading" style="max-height: 600px; overflow-y: auto;">
          <el-form label-width="180px" style="padding: 4px;">
            <h4 style="margin: 8px 0;">基础</h4>
            <el-form-item label="服务器名称"><el-input v-model="sections.basic.hostname" /></el-form-item>
            <el-form-item label="密码"><el-input v-model="sections.basic.password" type="password" show-password /></el-form-item>
            <el-form-item label="管理员密码"><el-input v-model="sections.basic.passwordAdmin" type="password" show-password /></el-form-item>
            <el-form-item label="最大玩家"><el-input-number v-model="sections.basic.maxPlayers" :min="1" :max="128" /></el-form-item>
            <el-form-item label="游戏端口"><el-input-number v-model="sections.basic.port" :min="1024" :max="65535" /></el-form-item>
            <el-form-item label="BattlEye"><el-switch v-model="sections.basic.battlEye" /></el-form-item>
            <el-form-item label="Persistent"><el-switch v-model="sections.basic.persistent" /></el-form-item>
            <el-form-item label="跳过大厅"><el-switch v-model="sections.basic.skipLobby" /></el-form-item>
            <el-form-item label="签名验证"><el-select v-model="sections.basic.verifySignatures">
              <el-option :value="0" label="关闭" /><el-option :value="1" label="警告" /><el-option :value="2" label="禁止" />
            </el-select></el-form-item>
            <el-form-item label="允许文件修补"><el-select v-model="sections.basic.allowedFilePatching">
              <el-option :value="0" label="禁止" /><el-option :value="1" label="客户端" /><el-option :value="2" label="所有人" />
            </el-select></el-form-item>
            <el-divider />
            <h4>MOTD / 欢迎语</h4>
            <el-form-item label="欢迎语"><el-input v-model="sections.basic.motd" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="MOTD 间隔(秒)"><el-input-number v-model="sections.basic.motdInterval" :min="0" :max="600" /></el-form-item>
            <el-divider />
            <h4>语音 (VoN)</h4>
            <el-form-item label="禁用 VoN"><el-switch v-model="sections.basic.disableVoN" /></el-form-item>
            <el-form-item label="VoN 质量"><el-input-number v-model="sections.basic.vonCodecQuality" :min="1" :max="30" /></el-form-item>
            <el-divider />
            <h4>投票 / 超时</h4>
            <el-form-item label="投票阈值"><el-input-number v-model="sections.basic.voteThreshold" :min="1" :max="100" /></el-form-item>
            <el-form-item label="投票超时(秒)"><el-input-number v-model="sections.basic.votingTimeout" :min="0" :max="999" /></el-form-item>
            <el-form-item label="任务投票人数"><el-input-number v-model="sections.basic.voteMissionPlayers" :min="0" :max="100" /></el-form-item>
            <el-form-item label="断线超时(秒)"><el-input-number v-model="sections.basic.disconnectTimeout" :min="0" :max="600" /></el-form-item>
            <el-form-item label="最大 Ping"><el-input-number v-model="sections.basic.maxPing" :min="50" :max="500" /></el-form-item>
            <el-form-item label="最大 Desync"><el-input-number v-model="sections.basic.maxDesync" :min="50" :max="500" /></el-form-item>
            <el-divider />
            <h4>无头客户端</h4>
            <el-form-item label="启用 HC"><el-switch v-model="sections.basic.enableHeadless" /></el-form-item>
            <el-form-item label="HC IP (逗号分隔)">
              <el-input v-model="sections.basic.headlessClients" placeholder="127.0.0.1,192.168.1.10" />
            </el-form-item>
            <el-form-item label="本机客户端">
              <el-input v-model="sections.basic.localClient" placeholder="127.0.0.1" />
            </el-form-item>
            <el-divider />
            <h4>日志 / 文件</h4>
            <el-form-item label="日志文件"><el-input v-model="sections.basic.logFile" placeholder="server_console.log" /></el-form-item>
            <el-form-item label="PID 文件"><el-input v-model="sections.basic.pidFile" /></el-form-item>
            <el-form-item label="统计启用"><el-switch v-model="sections.basic.statistics" /></el-form-item>
            <el-form-item style="margin-top: 12px;">
              <el-button type="primary" :loading="saving" @click="saveSection('basic')">保存</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="BattlEye" name="battleye">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="RCon 端口">
            <el-input-number v-model="sections.battleye.rconPort" :min="1024" :max="65535" />
          </el-form-item>
          <el-form-item label="RCon 密码">
            <el-input v-model="sections.battleye.rconPassword" type="password" show-password />
          </el-form-item>
          <el-form-item label="RCon 地址">
            <el-input v-model="sections.battleye.rconHost" placeholder="127.0.0.1" />
          </el-form-item>
          <el-form-item label="BE 路径">
            <el-input v-model="sections.battleye.bePath" placeholder="BattlEye" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('battleye')">保存</el-button>
          </el-form-item>
        </el-form>

        <el-divider />
        <h4>RCon 快捷操作</h4>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
          <el-button size="small" @click="doAction('rcon_players')">查询玩家</el-button>
          <el-button size="small" @click="doAction('rcon_lock')">锁服</el-button>
          <el-button size="small" @click="doAction('rcon_unlock')">解锁</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="模组" name="mods_config">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="已启用 ID">
            <el-input v-model="sections.mods.enabledIds" type="textarea" :rows="3"
              placeholder="450814997, 463939057" />
          </el-form-item>
          <el-form-item label="服务器模组">
            <el-input v-model="sections.mods.serverModIds" type="textarea" :rows="3"
              placeholder="450814997" />
          </el-form-item>
          <el-form-item label="自动 Bikey">
            <el-switch v-model="sections.mods.autoCopyBikey" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('mods')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="任务" name="missions">
        <div v-loading="loading">
          <el-table v-if="sections.missions?.length" :data="sections.missions" stripe size="small">
            <el-table-column prop="template" label="模板" />
            <el-table-column prop="difficulty" label="难度" width="80" />
          </el-table>
          <el-empty v-else description="无任务配置" />
          <el-divider />
          <h4>添加任务</h4>
          <el-form :inline="true" style="margin-top: 8px;">
            <el-form-item label="模板">
              <el-input v-model="newMission.template" placeholder="coop_01.Altis" />
            </el-form-item>
            <el-form-item label="难度">
              <el-input-number v-model="newMission.difficulty" :min="0" :max="5" />
            </el-form-item>
            <el-form-item>
              <el-button :loading="saving" @click="addMission">添加</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="定时任务" name="scheduler">
        <el-form label-width="140px" v-loading="loading">
          <el-form-item label="定时重启">
            <el-input v-model="sections.scheduler.restartCron" placeholder="0 4 * * *" />
          </el-form-item>
          <el-form-item label="监控采集">
            <el-input v-model="sections.scheduler.monitoringCron" placeholder="*/5 * * * *" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveSection('scheduler')">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="原始 JSON" name="raw">
        <pre class="config-json">{{ JSON.stringify(rawConfig, null, 2) }}</pre>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.config-json {
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 500px;
  overflow-y: auto;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
}
</style>
