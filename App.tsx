import React, { useState, useEffect, useCallback } from "react";
import { Menu, LogOut, Droplets, Plus } from "lucide-react";
import { Section, VendoState, HistoryEntry } from "./types";
import { NAV_ITEMS } from "./constants";
import { Dashboard } from "./components/Dashboard";
import { SalesReport } from "./components/SalesReport";
import { supabase } from "./lib/supabase";
import { Auth } from "./src/components/auth/Auth";

const INITIAL_STATE: VendoState = {
  insertedCoins: { p1: 0, p5: 0, p10: 0 },
  changeBank: { p1: 0, p5: 0 },
  waterLevel: 0,
  systemAlerts: "Offline",
  lastUpdated: "Initializing...",
  lastSeen: null,
  history: [],
};

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<Section>(Section.DASHBOARD);
  const [state, setState] = useState<VendoState>(INITIAL_STATE);
  const [dbStatus, setDbStatus] = useState<"connected" | "reconnecting" | "error">("reconnecting");
  const [session, setSession] = useState<any>(null);
  const [activeUnitId, setActiveUnitId] = useState<string>(
    localStorage.getItem("active_unit_id") || ""
  );

  /* ---------------- AUTH ---------------- */

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (activeUnitId)
      localStorage.setItem("active_unit_id", activeUnitId);
  }, [activeUnitId]);

  /* ---------------- DATA TRANSFORM ---------------- */

  const transformDataToNewState = (data: any): VendoState => {
    return {
      insertedCoins: {
        p1: data.p1_count ?? 0,
        p5: data.p5_count ?? 0,
        p10: data.p10_count ?? 0,
      },
      changeBank: {
        p1: data.change_p1_count ?? 0,
        p5: data.change_p5_count ?? 0,
      },
      waterLevel: data.water_level ?? 0,
      systemAlerts: data.system_status ?? "Offline",
      lastUpdated: data.updated_at
        ? new Date(data.updated_at).toLocaleTimeString()
        : "N/A",
      lastSeen: data.last_seen_at
        ? new Date(data.last_seen_at).toLocaleString()
        : null,
      history: [],
    };
  };

  /* ---------------- FETCH MACHINE STATE ---------------- */

  const fetchMachineState = useCallback(async () => {
    if (!session || !activeUnitId) return;

    try {
      setDbStatus("reconnecting");

      const { data, error } = await supabase
        .from("machine_state")
        .select("*")
        .eq("unit_id", activeUnitId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setState((prev) => ({
          ...prev,
          ...transformDataToNewState(data),
        }));
      }

      setDbStatus("connected");
    } catch (err) {
      console.error("Machine fetch error:", err);
      setDbStatus("error");
    }
  }, [session, activeUnitId]);

  /* ---------------- FETCH HISTORY ---------------- */

  const fetchHistory = useCallback(async () => {
    if (!session || !activeUnitId) return;

    try {
      const { data, error } = await supabase
        .from("collection_history")
        .select("*")
        .eq("unit_id", activeUnitId)
        .order("collected_at", { ascending: false });

      if (error) throw error;

      const history: HistoryEntry[] = (data || []).map((row: any) => ({
        id: row.id,
        date: new Date(row.collected_at).toLocaleString(),
        p1: row.p1_collected ?? 0,
        p5: row.p5_collected ?? 0,
        p10: row.p10_collected ?? 0,
        total: Number(row.total_amount ?? 0),
      }));

      setState((prev) => ({ ...prev, history }));
    } catch (err) {
      console.error("History fetch error:", err);
    }
  }, [session, activeUnitId]);

  /* ---------------- POLLING EVERY 3 SECONDS ---------------- */

  useEffect(() => {
    if (!session || !activeUnitId) return;

    fetchMachineState();
    fetchHistory();

    const interval = setInterval(() => {
      fetchMachineState();
    }, 3000);

    return () => clearInterval(interval);
  }, [session, activeUnitId, fetchMachineState, fetchHistory]);

  /* ---------------- RENDER ---------------- */

  if (!session) return <Auth />;

  return (
    <div>
      <header>
        <h1>AQUAFLOW</h1>
        <span>
          {dbStatus === "connected"
            ? "Online"
            : dbStatus === "reconnecting"
            ? "Syncing"
            : "Offline"}
        </span>
      </header>

      {activeSection === Section.DASHBOARD && (
        <Dashboard
          state={state}
          activeUnitId={activeUnitId}
          onReset={() => {}}
          onResetCounter={() => {}}
          onExport={() => {}}
          isResetting={false}
        />
      )}

      {activeSection === Section.SALES && (
        <SalesReport
          state={state}
          activeUnitId={activeUnitId}
          onResetCounter={() => {}}
          isResetting={false}
        />
      )}
    </div>
  );
};

export default App;
