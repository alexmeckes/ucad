import { useState, useCallback } from "react";

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  isGitRepo: boolean;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const refreshProjects = useCallback(async (): Promise<void> => {
    const next = await window.ucad.listProjects();
    setProjects(next);
    setProjectsLoaded(true);
    setSelectedProjectId((current) => {
      if (!current && next.length > 0) return next[0].id;
      return current;
    });
  }, []);

  const createProject = useCallback(async (): Promise<string | null> => {
    if (!projectName || !projectPath) return null;
    const created = await window.ucad.createProject({
      name: projectName,
      rootPath: projectPath,
    });
    await refreshProjects();
    setSelectedProjectId(created.id);
    setProjectName("");
    setProjectPath("");
    return created.id;
  }, [projectName, projectPath, refreshProjects]);

  return {
    projects,
    projectsLoaded,
    selectedProjectId,
    selectedProject,
    setSelectedProjectId,
    projectName,
    setProjectName,
    projectPath,
    setProjectPath,
    refreshProjects,
    createProject,
  };
}
