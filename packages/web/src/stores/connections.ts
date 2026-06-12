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

  function getClient(): A3stClient | null {
    const conn = active.value;
    if (!conn) return null;
    return createClient(conn.baseUrl.trim(), conn.token);
  }

  return { connections, activeId, active, add, remove, setActive, getClient, persist };
});
