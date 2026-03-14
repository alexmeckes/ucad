import { useEffect, useState, useCallback } from "react";
import type { AdapterSettingsState } from "@ucad/contracts";

import { useHealth } from "./hooks/useHealth";
import { useProjects } from "./hooks/useProjects";
import { useSessions } from "./hooks/useSessions";
import { useEvents } from "./hooks/useEvents";
import { usePermissions } from "./hooks/usePermissions";
import { useAdapterCatalog } from "./hooks/useAdapterCatalog";
import { useAutoBootstrap } from "./hooks/useAutoBootstrap";
import { useReview } from "./hooks/useReview";

import { adapterLabel } from "./utils/adapterLabel";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Conversation } from "./components/Conversation/Conversation";
import { Composer } from "./components/Composer/Composer";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { ReviewDrawer } from "./components/Review/ReviewDrawer";

export const App = () => {
  const { health, refreshHealth } = useHealth();
  const {
    projects, projectsLoaded, selectedProjectId, selectedProject, setSelectedProjectId,
    projectName, setProjectName, projectPath, setProjectPath,
    refreshProjects, createProject,
  } = useProjects();
  const {
    sessions, selectedSessionId, selectedSession, sessionChildren,
    setSelectedSessionId, refreshSessions, createSession, forkSession, ROOT_NODE,
  } = useSessions();
  const {
    events, conversationItems, isWaiting, permissionEvent, clearPermissionEvent, sendTurn,
  } = useEvents(selectedSessionId);
  const { resolvePermission } = usePermissions(permissionEvent, selectedSessionId, clearPermissionEvent);
  const {
    adapters, selectedAdapterId, setSelectedAdapterId,
    selectedMode, setSelectedMode,
    selectedModel, setSelectedModel, modelSuggestions,
    selectedEffort, setSelectedEffort, effortLevels,
    refreshAdapterCatalog, getModelSuggestionsForAdapter,
  } = useAdapterCatalog();

  const [adapterSettings, setAdapterSettings] = useState<AdapterSettingsState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const refreshAdapterSettings = useCallback(async (): Promise<void> => {
    try {
      setAdapterSettings(await window.ucad.getAdapterSettings());
    } catch {
      // silently handle
    }
  }, []);

  const { autoBootstrapStatus, autoBootstrapMessage } = useAutoBootstrap(
    health, adapters, projects, projectsLoaded,
    refreshProjects, refreshSessions, refreshHealth,
    setSelectedProjectId, setSelectedSessionId,
  );

  const review = useReview(selectedSessionId);

  // Initial load
  useEffect(() => {
    void (async () => {
      await refreshHealth();
      await refreshAdapterCatalog();
      await refreshAdapterSettings();
      await refreshProjects();
    })();
  }, [refreshHealth, refreshAdapterCatalog, refreshAdapterSettings, refreshProjects]);

  // Refresh sessions on project change
  useEffect(() => {
    if (selectedProjectId) void refreshSessions(selectedProjectId);
  }, [selectedProjectId, refreshSessions]);

  const handleCreateSession = useCallback(async () => {
    if (!selectedProjectId) return;
    await createSession(selectedProjectId, selectedAdapterId, selectedMode, selectedProject?.rootPath ?? "", selectedModel || undefined, selectedEffort || undefined);
    await refreshHealth();
  }, [selectedProjectId, selectedAdapterId, selectedMode, selectedModel, selectedEffort, selectedProject, createSession, refreshHealth]);

  const handleQuickCreateSession = useCallback(async (adapterId: string, model?: string) => {
    if (!selectedProjectId) return;
    setSelectedAdapterId(adapterId);
    await createSession(selectedProjectId, adapterId, selectedMode, selectedProject?.rootPath ?? "", model);
    await refreshHealth();
  }, [selectedProjectId, selectedMode, selectedProject, createSession, refreshHealth, setSelectedAdapterId]);

  const handleForkSession = useCallback(async (strategy: "local" | "worktree" | "snapshot" = "worktree") => {
    if (!selectedSessionId) return;
    await forkSession(selectedSessionId, selectedProjectId, strategy);
    await refreshHealth();
  }, [selectedSessionId, selectedProjectId, forkSession, refreshHealth]);

  const handleInterrupt = useCallback(() => {
    if (selectedSessionId) void window.ucad.interruptSession(selectedSessionId);
  }, [selectedSessionId]);

  // Cmd+K to open settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        selectedProject={selectedProject}
        onSelectProject={setSelectedProjectId}
        projectName={projectName}
        setProjectName={setProjectName}
        projectPath={projectPath}
        setProjectPath={setProjectPath}
        onCreateProject={createProject}
        sessions={sessions}
        sessionChildren={sessionChildren}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
        rootNode={ROOT_NODE}
        adapters={adapters}
        selectedAdapterId={selectedAdapterId}
        onSelectAdapter={setSelectedAdapterId}
        selectedMode={selectedMode}
        onSelectMode={setSelectedMode}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        modelSuggestions={modelSuggestions}
        selectedEffort={selectedEffort}
        onSelectEffort={setSelectedEffort}
        effortLevels={effortLevels}
        onCreateSession={() => void handleCreateSession()}
        onQuickCreateSession={(id) => void handleQuickCreateSession(id)}
        onForkSession={(strategy) => void handleForkSession(strategy)}
        onOpenSettings={() => setSettingsOpen(true)}
        canFork={!!selectedSessionId}
        canCreateSession={!!selectedProjectId}
      />

      <div className="app-main">
        <Conversation
          items={conversationItems}
          rawEvents={events}
          permissionEvent={permissionEvent}
          onResolvePermission={resolvePermission}
          isWaiting={isWaiting}
          projectName={selectedProject?.name ?? null}
          session={selectedSession}
          adapters={adapters}
          onQuickCreateSession={(id) => void handleQuickCreateSession(id)}
        />
        <Composer
          onSend={sendTurn}
          disabled={!selectedSessionId}
          placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
          adapterLabel={selectedSession?.adapterId
            ? adapterLabel(selectedSession.adapterId)
            : null}
          sessionTitle={selectedSession?.title ?? null}
          modelSuggestions={getModelSuggestionsForAdapter(selectedSession?.adapterId ?? selectedAdapterId)}
          onSwitchModel={(model) => void handleQuickCreateSession(selectedSession?.adapterId ?? selectedAdapterId, model)}
        />
      </div>

      <StatusBar
        health={health}
        selectedSession={selectedSession}
        selectedAdapterId={selectedAdapterId}
        selectedMode={selectedMode}
        selectedModel={selectedModel}
        autoBootstrapMessage={autoBootstrapMessage}
        autoBootstrapStatus={autoBootstrapStatus}
        onRefreshHealth={() => void refreshHealth()}
        onOpenReview={() => setReviewOpen(true)}
        onInterrupt={handleInterrupt}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        health={health}
        onRefreshHealth={refreshHealth}
        adapterSettings={adapterSettings}
        onAdapterSettingsChange={setAdapterSettings}
        onRefreshAdapterCatalog={refreshAdapterCatalog}
        onRefreshAdapterSettings={refreshAdapterSettings}
      />

      <ReviewDrawer
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        selectedSessionId={selectedSessionId}
        diffText={review.diffText}
        setDiffText={review.setDiffText}
        diffScope={review.diffScope}
        setDiffScope={review.setDiffScope}
        baseRef={review.baseRef}
        setBaseRef={review.setBaseRef}
        filePath={review.filePath}
        setFilePath={review.setFilePath}
        changedFiles={review.changedFiles}
        onLoadDiff={review.loadDiff}
        onStageFile={review.stageFile}
        onRevertFile={review.revertFile}
        onStagePatch={review.stagePatch}
        onRevertPatch={review.revertPatch}
      />
    </div>
  );
};
