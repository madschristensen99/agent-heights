import { useState, useEffect } from "react";
import { DashboardProvider, useDashboard } from "./lib/store";
import { onAuthChange, isAuthEnabled, initAuth } from "./lib/auth";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar, type View } from "./components/Sidebar";
import { AgentFleet } from "./components/AgentFleet";
import { AgentDetail } from "./components/AgentDetail";
import { TaskBoard } from "./components/TaskBoard";
import { GanttChart } from "./components/GanttChart";
import { VModelDiagram } from "./components/VModelDiagram";
import { Settings } from "./components/Settings";
import { Toasts } from "./components/Toasts";
import { ScheduleView } from "./components/ScheduleView";
import { MarketplaceView } from "./components/MarketplaceView";
import { MCPManager } from "./components/MCPManager";
import { FiredAgents } from "./components/FiredAgents";
import { FileBrowser } from "./components/FileBrowser";
import { MemoryViewer } from "./components/MemoryViewer";
import { WalletPanel } from "./components/WalletPanel";
import { PlatformStats } from "./components/PlatformStats";
import { getUserEmail } from "./lib/auth";

function DashboardApp() {
  const { connected, agents, board, schedules, officeMcpServers, firedAgents, vacationedAgents, player } = useDashboard();
  const [view, setView] = useState<View>("fleet");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const userEmail = getUserEmail();

  const handleSelectAgent = (id: string) => {
    setSelectedAgent(id);
    setView("agent");
  };

  const handleViewChange = (v: View) => {
    setView(v);
    if (v !== "agent" && v !== "files" && v !== "memory" && v !== "wallet" && v !== "gantt" && v !== "vmodel") {
      setSelectedAgent(null);
    }
  };

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Sidebar
        view={view}
        onViewChange={handleViewChange}
        agentCount={agents.size}
        boardCount={board.length}
        scheduleCount={schedules.length}
        mcpCount={officeMcpServers.length}
        firedCount={firedAgents.length + vacationedAgents.length}
        connected={connected}
        bossName={player?.name ?? "User"}
        userEmail={userEmail}
      />
      {view === "fleet" && <AgentFleet onSelectAgent={handleSelectAgent} />}
      {view === "agent" && selectedAgent && (
        <AgentDetail
          agentId={selectedAgent}
          onBack={() => handleViewChange("fleet")}
          onViewFiles={(id) => { setSelectedAgent(id); setView("files"); }}
          onViewMemory={(id) => { setSelectedAgent(id); setView("memory"); }}
          onViewWallet={(id) => { setSelectedAgent(id); setView("wallet"); }}
        />
      )}
      {view === "board" && <TaskBoard />}
      {view === "gantt" && <GanttChart />}
      {view === "vmodel" && <VModelDiagram />}
      {view === "schedules" && <ScheduleView />}
      {view === "marketplace" && <MarketplaceView />}
      {view === "mcp" && <MCPManager />}
      {view === "fired" && <FiredAgents />}
      {view === "settings" && <Settings />}
      {view === "stats" && <PlatformStats />}
      {view === "files" && selectedAgent && (
        <FileBrowser agentId={selectedAgent} onBack={() => setView("agent")} />
      )}
      {view === "memory" && selectedAgent && (
        <MemoryViewer agentId={selectedAgent} onBack={() => setView("agent")} />
      )}
      {view === "wallet" && selectedAgent && (
        <WalletPanel agentId={selectedAgent} onBack={() => setView("agent")} />
      )}
      <Toasts />
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthEnabled) {
      setAuthed(true);
      return;
    }
    void initAuth();
    const unsub = onAuthChange((state) => {
      if (!state.loading) {
        setAuthed(!!state.session);
      }
    });
    return () => unsub();
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen />;
  }

  return (
    <DashboardProvider>
      <DashboardApp />
    </DashboardProvider>
  );
}

export default App;
