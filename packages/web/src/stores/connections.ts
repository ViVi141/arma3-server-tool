import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createClient, type A3stClient } from "@a3st/api-client";

export interface SavedConnection {
  id: string;
  name: string;
  baseUrl: string;
  token?: string;
  isLocal?: boolean;
}

function defaultLocalPort(): string {
  return "19580";
}

export const useConnectionsStore = defineStore("connections", () => {
  const connections = ref<SavedConnection[]>(loadConnections());
  const activeId = ref<string | null>(null);

  const active = computed(() => connections.value.find((c) => c.id === activeId.value) ?? null);

  function loadConnections(): SavedConnection[] {
    try {
      const raw = localStorage.getItem("a3st-connections");
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    // default: local
    const defaultConn: SavedConnection = {
      id: "local",
      name: "本机",
      baseUrl: `http://127.0.0.1:${defaultLocalPort()}`,
      isLocal: true,
    };
    return [defaultConn];
  }

  function persist() {
    localStorage.setItem("a3st-connections", JSON.stringify(connections.value));
  }

  function add(conn: Omit<SavedConnection, "id">) {
    const id = crypto.randomUUID();
    connections.value.push({ id, ...conn, baseUrl: conn.baseUrl.trim() });
    persist();
    return id;
  }

  function remove(id: string) {
    connections.value = connections.value.filter((c) => c.id !== id);
    if (activeId.value === id) activeId.value = null;
    persist();
  }

  function setActive(id: string) {
    activeId.value = id;
  }

  function updateConnection(id: string, patch: Partial<Omit<SavedConnection, "id">>): void {
    const idx = connections.value.findIndex((c) => c.id === id);
    if (idx < 0) {
      return;
    }
    const current = connections.value[idx];
    connections.value[idx] = {
      ...current,
      ...patch,
      id: current.id,
    };
    if (patch.baseUrl !== undefined) {
      connections.value[idx].baseUrl = patch.baseUrl.trim();
    }
    persist();
  }

  /** Electron 被控 Token/端口变更后，同步到「本机」连接，避免 UI 能开但 API 全 401。 */
  async function syncLocalFromElectronSettings(): Promise<void> {
    if (!window.electronAPI?.getServiceSettings) {
      return;
    }
    try {
      const settings = await window.electronAPI.getServiceSettings();
      const port = settings.port && settings.port > 0 ? settings.port : 19580;
      const baseUrl = `http://127.0.0.1:${port}`;
      let token: string | undefined;
      if (settings.apiToken && settings.apiToken.trim()) {
        token = settings.apiToken.trim();
      } else {
        token = undefined;
      }

      const local = connections.value.find((c) => c.id === "local" || c.isLocal);
      if (local) {
        updateConnection(local.id, { baseUrl, token, isLocal: true });
        return;
      }
      connections.value.unshift({
        id: "local",
        name: "本机",
        baseUrl,
        token,
        isLocal: true,
      });
      persist();
    } catch {
      /* ignore */
    }
  }

  function getClient(): A3stClient | null {
    const conn = active.value;
    if (!conn) return null;
    return createClient(conn.baseUrl.trim(), conn.token);
  }

  return {
    connections,
    activeId,
    active,
    add,
    remove,
    setActive,
    updateConnection,
    syncLocalFromElectronSettings,
    getClient,
    persist,
  };
});
