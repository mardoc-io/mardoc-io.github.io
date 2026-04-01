"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { RepoFile, PullRequest, PRFile, PRComment, ViewMode } from "@/types";
import { initOctokit, fetchRepoTree, fetchPullRequests, fetchFileContent, fetchPRFiles, fetchPRComments } from "./github-api";
import { repoFiles as mockFiles, pullRequests as mockPRs, findFile } from "./mock-data";

interface AppState {
  // Auth
  isAuthenticated: boolean;
  githubToken: string | null;
  setGithubToken: (token: string | null) => void;
  isDemoMode: boolean;

  // Repo
  currentRepo: string | null;
  setCurrentRepo: (repo: string) => void;
  repoFiles: RepoFile[];
  pullRequests: PullRequest[];

  // Navigation
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  selectedFile: RepoFile | null;
  setSelectedFile: (file: RepoFile | null) => void;
  selectedPR: PullRequest | null;
  setSelectedPR: (pr: PullRequest | null) => void;
  fileContent: string;

  // PR detail state (shared between sidebar and PRDetail)
  prFiles: PRFile[];
  prComments: PRComment[];
  selectedPRFileIdx: number;
  setSelectedPRFileIdx: (idx: number) => void;
  loadingPRFiles: boolean;

  // Loading states
  loadingFiles: boolean;
  loadingPRs: boolean;
  loadingContent: boolean;
  error: string | null;

  // Actions
  refreshRepo: () => Promise<void>;
  openFile: (file: RepoFile) => Promise<void>;
  openPR: (pr: PullRequest) => void;
}

const AppContext = createContext<AppState | null>(null);

const TOKEN_KEY = "mardoc_github_token";
const REPO_KEY = "mardoc_current_repo";

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Auth state — rehydrate from localStorage
  const [githubToken, setGithubTokenState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  });
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem(TOKEN_KEY);
  });

  // Repo state
  const [currentRepo, setCurrentRepoState] = useState<string | null>(null);
  const [repoFilesList, setRepoFiles] = useState<RepoFile[]>(mockFiles);
  const [prList, setPRList] = useState<PullRequest[]>(mockPRs);

  // Navigation
  const [currentView, setCurrentView] = useState<ViewMode>("editor");
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null);
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [fileContent, setFileContent] = useState("");

  // PR detail state
  const [prFiles, setPRFiles] = useState<PRFile[]>([]);
  const [prComments, setPRComments] = useState<PRComment[]>([]);
  const [selectedPRFileIdx, setSelectedPRFileIdx] = useState(0);
  const [loadingPRFiles, setLoadingPRFiles] = useState(false);

  // Loading
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!githubToken;

  // Initialize octokit when token changes, persist to localStorage
  const setGithubToken = useCallback((token: string | null) => {
    setGithubTokenState(token);
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      initOctokit(token);
      setIsDemoMode(false);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REPO_KEY);
      setIsDemoMode(true);
      setRepoFiles(mockFiles);
      setPRList(mockPRs);
    }
  }, []);

  // Restore session on mount: init Octokit and reload last repo
  useEffect(() => {
    if (!githubToken) return;
    initOctokit(githubToken);
    const savedRepo = localStorage.getItem(REPO_KEY);
    if (savedRepo) {
      setCurrentRepo(savedRepo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // Set current repo and load data
  const setCurrentRepo = useCallback(
    async (repo: string) => {
      setCurrentRepoState(repo);
      localStorage.setItem(REPO_KEY, repo);
      setError(null);

      if (!githubToken) return;

      // Load files
      setLoadingFiles(true);
      try {
        const files = await fetchRepoTree(repo);
        setRepoFiles(files);
      } catch (err: any) {
        setError(`Failed to load repository: ${err.message}`);
        setRepoFiles([]);
      } finally {
        setLoadingFiles(false);
      }

      // Load PRs
      setLoadingPRs(true);
      try {
        const prs = await fetchPullRequests(repo, "all");
        setPRList(prs);
      } catch (err: any) {
        console.error("Failed to load PRs:", err);
        setPRList([]);
      } finally {
        setLoadingPRs(false);
      }
    },
    [githubToken]
  );

  // Open a file and load its content
  const openFile = useCallback(
    async (file: RepoFile) => {
      setSelectedFile(file);
      setSelectedPR(null);
      setCurrentView("editor");

      if (isDemoMode) {
        // Use mock data content
        const mockFile = findFile(mockFiles, file.path);
        setFileContent(mockFile?.content || "");
        return;
      }

      if (!currentRepo || !githubToken) return;

      setLoadingContent(true);
      try {
        const content = await fetchFileContent(currentRepo, file.path);
        setFileContent(content);
        // Also store it on the file object for caching
        file.content = content;
      } catch (err: any) {
        setError(`Failed to load file: ${err.message}`);
        setFileContent("");
      } finally {
        setLoadingContent(false);
      }
    },
    [isDemoMode, currentRepo, githubToken]
  );

  // Open a PR and fetch its files + comments
  const openPR = useCallback(
    (pr: PullRequest) => {
      setSelectedPR(pr);
      setSelectedFile(null);
      setCurrentView("pr-diff");
      setSelectedPRFileIdx(0);

      // Use demo data if available
      if (pr.files.length > 0) {
        setPRFiles(pr.files);
        setPRComments(pr.comments);
        return;
      }

      // Fetch from GitHub
      if (!currentRepo || isDemoMode) return;

      setLoadingPRFiles(true);
      Promise.all([
        fetchPRFiles(currentRepo, pr.number),
        fetchPRComments(currentRepo, pr.number),
      ])
        .then(([files, comments]) => {
          setPRFiles(files);
          setPRComments(comments);
        })
        .catch((err) => console.error("Failed to load PR details:", err))
        .finally(() => setLoadingPRFiles(false));
    },
    [currentRepo, isDemoMode]
  );

  // Refresh the current repo
  const refreshRepo = useCallback(async () => {
    if (currentRepo && githubToken) {
      await setCurrentRepo(currentRepo);
    }
  }, [currentRepo, githubToken, setCurrentRepo]);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        githubToken,
        setGithubToken,
        isDemoMode,
        currentRepo,
        setCurrentRepo,
        repoFiles: repoFilesList,
        pullRequests: prList,
        currentView,
        setCurrentView,
        selectedFile,
        setSelectedFile,
        selectedPR,
        setSelectedPR,
        fileContent,
        prFiles,
        prComments,
        selectedPRFileIdx,
        setSelectedPRFileIdx,
        loadingPRFiles,
        loadingFiles,
        loadingPRs,
        loadingContent,
        error,
        refreshRepo,
        openFile,
        openPR,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
