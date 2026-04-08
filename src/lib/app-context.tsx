"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { RepoFile, PullRequest, PRFile, PRComment, ViewMode } from "@/types";
import { initOctokit, fetchRepoTree, fetchPullRequests, fetchFileContent, fetchPRFiles, fetchPRComments, fetchDefaultBranch, fetchBranches, fetchPRMarkdownCounts } from "./github-api";
import { repoFiles as mockFiles, pullRequests as mockPRs, findFile, flattenFiles } from "./mock-data";
import { parseHash, buildFileHash, buildPRHash, buildRepoHash } from "./hash-router";
import * as safeStorage from "./safe-storage";
import { isHtmlFile } from "./file-types";

interface AppState {
  // Auth
  isAuthenticated: boolean;
  githubToken: string | null;
  setGithubToken: (token: string | null) => void;
  isDemoMode: boolean;

  // Repo
  currentRepo: string | null;
  defaultBranch: string;
  selectedBranch: string;
  availableBranches: { name: string; isDefault: boolean }[];
  setSelectedBranch: (branch: string) => void;
  setCurrentRepo: (repo: string) => void;
  repoFiles: RepoFile[];
  pullRequests: PullRequest[];
  prStateFilter: "open" | "closed" | "all";
  setPRStateFilter: (state: "open" | "closed" | "all") => void;

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

  // New file for PR
  prBranchForNewFile: string | null;
  prNumberForNewFile: number | null;

  // Actions
  refreshRepo: () => Promise<void>;
  openFile: (file: RepoFile) => Promise<void>;
  openPR: (pr: PullRequest) => void;
  createNewFile: () => void;
  addFileToPR: (pr: PullRequest) => void;
  openLocalFile: (name: string, content: string) => void;
  isEmbedded: boolean;
}

const AppContext = createContext<AppState | null>(null);

const TOKEN_KEY = "mardoc_github_token";
const REPO_KEY = "mardoc_current_repo";

// Module-level cache for VS Code init data — survives React Strict Mode remount
let vsCodeInitData: Record<string, any> | null = null;

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Embed mode — detected from URL query param, deferred to avoid hydration mismatch
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("embed") === "true") {
      setIsEmbedded(true);
    }
  }, []);

  // Auth state — server-safe defaults, hydrated in useEffect
  const [githubToken, setGithubTokenState] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(true);

  // Repo state
  const [currentRepo, setCurrentRepoState] = useState<string | null>(null);
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [selectedBranch, setSelectedBranchState] = useState("main");
  const [availableBranches, setAvailableBranches] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [repoFilesList, setRepoFiles] = useState<RepoFile[]>(mockFiles);
  const [prList, setPRList] = useState<PullRequest[]>(mockPRs);
  const [prStateFilter, setPRStateFilterState] = useState<"open" | "closed" | "all">("open");

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

  // Suppress hashchange handling when we're the ones updating the hash
  const suppressHashChange = useRef(false);
  const setHash = useCallback((hash: string) => {
    suppressHashChange.current = true;
    window.location.hash = hash;
    // Reset after the hashchange event fires
    setTimeout(() => { suppressHashChange.current = false; }, 0);
  }, []);

  // Initialize octokit when token changes, persist to localStorage
  const setGithubToken = useCallback((token: string | null) => {
    setGithubTokenState(token);
    if (token) {
      safeStorage.setItem(TOKEN_KEY, token);
      initOctokit(token);
      setIsDemoMode(false);
    } else {
      safeStorage.removeItem(TOKEN_KEY);
      safeStorage.removeItem(REPO_KEY);
      setIsDemoMode(true);
      setRepoFiles(mockFiles);
      setPRList(mockPRs);
    }
  }, []);

  // Hydrate auth state from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const savedToken = safeStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      setGithubTokenState(savedToken);
      setIsDemoMode(false);
      initOctokit(savedToken);
    }
  }, []);

  // Embed mode: listen for postMessage from VS Code extension
  const pendingInitRef = useRef<{ owner: string; repo: string; branch: string; token: string; fileName?: string } | null>(null);

  const applyInitData = useCallback((data: Record<string, any>) => {
    setIsEmbedded(true);

    if (data.token) {
      setGithubTokenState(data.token);
      setIsDemoMode(false);
      initOctokit(data.token);
    }
    if (data.owner && data.repo) {
      pendingInitRef.current = data as any;
    }

    if (data.fileName && data.fileContent) {
      // Real file provided — exit demo mode even without a token
      setIsDemoMode(false);
      const localPath = data.filePath || data.fileName;
      const localFile: RepoFile = {
        id: `local-${Date.now()}`,
        name: data.fileName,
        path: `__local__/${localPath}`,
        type: "file" as const,
      };
      setSelectedFile(localFile);
      setSelectedPR(null);
      setCurrentView(isHtmlFile(data.fileName) ? "html-viewer" : "editor");
      setFileContent(data.fileContent);
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "init") return;

      // Cache at module level so Strict Mode remount can replay
      vsCodeInitData = data;
      applyInitData(data);
    };

    window.addEventListener("message", handleMessage);

    // On mount (or Strict Mode remount), replay cached init data if available
    if (vsCodeInitData) {
      applyInitData(vsCodeInitData);
    }

    // Signal to parent that we're ready to receive init
    if (window.parent !== window) {
      window.parent.postMessage({ type: "ready" }, "*");
    }

    return () => window.removeEventListener("message", handleMessage);
  }, [isEmbedded]);



  // Set current repo and load data
  const setCurrentRepo = useCallback(
    async (repo: string) => {
      setCurrentRepoState(repo);
      safeStorage.setItem(REPO_KEY, repo);
      setError(null);
      setHash(buildRepoHash(repo));

      if (!githubToken) return;

      // Fetch default branch, then load files using it
      let branch = "main";
      try {
        branch = await fetchDefaultBranch(repo);
        setDefaultBranch(branch);
        setSelectedBranchState(branch);
      } catch {
        // Fall back to "main" if we can't determine default branch
      }

      setLoadingFiles(true);
      try {
        const files = await fetchRepoTree(repo, branch);
        setRepoFiles(files);
      } catch (err: any) {
        setError(`Failed to load repository: ${err.message}`);
        setRepoFiles([]);
      } finally {
        setLoadingFiles(false);
      }

      // Load PRs and branches in parallel
      await loadPRs(repo, prStateFilter);

      setLoadingPRs(true);
      try {
        const branches = await fetchBranches(repo).catch(() => [] as { name: string; isDefault: boolean }[]);
        setAvailableBranches(branches);
      } catch {
        // branches are non-critical
      } finally {
        setLoadingPRs(false);
      }
    },
    [githubToken, prStateFilter]
  );

  const loadPRs = useCallback(async (repo: string, state: "open" | "closed" | "all") => {
    if (!githubToken) return;
    setLoadingPRs(true);
    try {
      const prs = await fetchPullRequests(repo, state);
      setPRList(prs);

      // Enrich with markdown file counts (non-blocking)
      if (prs.length > 0) {
        fetchPRMarkdownCounts(repo, prs.map((p) => p.number)).then((counts) => {
          setPRList((prev) =>
            prev.map((p) => ({ ...p, mdFileCount: counts.get(p.number) ?? 0 }))
          );
        });
      }
    } catch (err: any) {
      console.error("Failed to load PRs:", err);
      setPRList([]);
    } finally {
      setLoadingPRs(false);
    }
  }, [githubToken]);

  const setPRStateFilter = useCallback((state: "open" | "closed" | "all") => {
    setPRStateFilterState(state);
    if (currentRepo) {
      loadPRs(currentRepo, state);
    }
  }, [currentRepo, loadPRs]);

  // Embed mode: process pending init repo after token and setCurrentRepo are ready.
  // Preserve any file that was already opened by applyInitData.
  useEffect(() => {
    if (!pendingInitRef.current || !githubToken) return;
    const { owner, repo } = pendingInitRef.current;
    const hadFile = !!pendingInitRef.current.fileName;
    pendingInitRef.current = null;

    // Load repo context (file tree, PRs, branches) in background
    setCurrentRepo(`${owner}/${repo}`).then(() => {
      // setCurrentRepo may reset the view — restore if a file was opened
      if (hadFile && vsCodeInitData?.fileName) {
        const name = vsCodeInitData.fileName;
        const localPath = vsCodeInitData.filePath || name;
        setSelectedFile({
          id: `local-${Date.now()}`,
          name,
          path: `__local__/${localPath}`,
          type: "file",
        });
        setSelectedPR(null);
        setCurrentView(isHtmlFile(name) ? "html-viewer" : "editor");
        setFileContent(vsCodeInitData.fileContent || "");
      }
    });
  }, [githubToken, setCurrentRepo]);

  // Auto-restore: hash route wins over localStorage
  useEffect(() => {
    if (!githubToken || currentRepo) return;

    const route = parseHash(window.location.hash);
    if (route.type !== "none" && route.repoFullName) {
      // Hash route present — repo will be loaded by the hash navigation effect
      return;
    }

    const savedRepo = safeStorage.getItem(REPO_KEY);
    if (savedRepo) {
      setCurrentRepo(savedRepo);
    }
  }, [githubToken, currentRepo, setCurrentRepo]);

  // Switch branch and reload file tree
  const setSelectedBranch = useCallback(
    async (branch: string) => {
      setSelectedBranchState(branch);
      setSelectedFile(null);
      setFileContent("");

      if (!currentRepo || !githubToken) return;

      setLoadingFiles(true);
      try {
        const files = await fetchRepoTree(currentRepo, branch);
        setRepoFiles(files);
      } catch (err: any) {
        setError(`Failed to load branch: ${err.message}`);
        setRepoFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    },
    [currentRepo, githubToken]
  );

  // Open a file and load its content
  const openFile = useCallback(
    async (file: RepoFile) => {
      setSelectedFile(file);
      setSelectedPR(null);
      setCurrentView(isHtmlFile(file.name) ? "html-viewer" : "editor");

      // Update URL hash
      if (currentRepo) {
        setHash(buildFileHash(currentRepo, selectedBranch, file.path));
      }

      if (isDemoMode) {
        // Use mock data content
        const mockFile = findFile(mockFiles, file.path);
        setFileContent(mockFile?.content || "");
        return;
      }

      if (!currentRepo || !githubToken) return;

      setLoadingContent(true);
      try {
        const content = await fetchFileContent(currentRepo, file.path, selectedBranch);
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
    [isDemoMode, currentRepo, githubToken, selectedBranch]
  );

  // PR-scoped new file state
  const [prBranchForNewFile, setPRBranchForNewFile] = useState<string | null>(null);
  const [prNumberForNewFile, setPRNumberForNewFile] = useState<number | null>(null);

  // Create a new (unsaved) file and open it in the editor
  const createNewFile = useCallback(() => {
    const newFile: RepoFile = {
      id: `new-${Date.now()}`,
      name: "untitled.md",
      path: "__new__/untitled.md",
      type: "file",
    };
    setSelectedFile(newFile);
    setSelectedPR(null);
    setPRBranchForNewFile(null);
    setPRNumberForNewFile(null);
    setCurrentView("editor");
    setFileContent("");
  }, []);

  // Add a new file to an existing PR branch
  const addFileToPR = useCallback((pr: PullRequest) => {
    const newFile: RepoFile = {
      id: `pr-new-${Date.now()}`,
      name: "untitled.md",
      path: "__new__/untitled.md",
      type: "file",
    };
    setSelectedFile(newFile);
    setPRBranchForNewFile(pr.headBranch);
    setPRNumberForNewFile(pr.number);
    setCurrentView("editor");
    setFileContent("");
  }, []);

  // Open a local file from the filesystem
  const openLocalFile = useCallback((name: string, content: string) => {
    const localFile: RepoFile = {
      id: `local-${Date.now()}`,
      name,
      path: `__local__/${name}`,
      type: "file",
    };
    setSelectedFile(localFile);
    setSelectedPR(null);
    setPRBranchForNewFile(null);
    setPRNumberForNewFile(null);
    setCurrentView(isHtmlFile(name) ? "html-viewer" : "editor");
    setFileContent(content);
  }, []);


  // Open a PR and fetch its files + comments
  const openPR = useCallback(
    (pr: PullRequest) => {
      setSelectedPR(pr);
      setSelectedFile(null);
      setCurrentView("pr-diff");
      setSelectedPRFileIdx(0);

      // Update URL hash
      if (currentRepo) {
        setHash(buildPRHash(currentRepo, pr.number));
      }

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

  // Update hash when PR file selection changes
  const setSelectedPRFileIdxWithHash = useCallback((idx: number) => {
    setSelectedPRFileIdx(idx);
    if (currentRepo && selectedPR) {
      setHash(buildPRHash(currentRepo, selectedPR.number, idx));
    }
  }, [currentRepo, selectedPR, setHash]);

  // Navigate to a hash route — used on init and on hashchange
  const navigateToHash = useCallback(async (hash: string) => {
    const route = parseHash(hash);
    if (route.type === "none") return;

    // Load repo if needed
    if (route.repoFullName && route.repoFullName !== currentRepo) {
      await setCurrentRepo(route.repoFullName);
    }

    if (route.type === "file" && route.filePath) {
      // Need to find the file in the tree — it may not be loaded yet
      // We'll set branch if specified, then navigate
      if (route.branch && route.branch !== selectedBranch) {
        setSelectedBranchState(route.branch);
      }
      // Create a minimal RepoFile to open
      const file: RepoFile = {
        id: `hash-${route.filePath}`,
        name: route.filePath.split("/").pop() || route.filePath,
        path: route.filePath,
        type: "file",
      };
      await openFile(file);
    } else if (route.type === "pr" && route.prNumber) {
      // Find the PR in the loaded list, or create a stub
      const pr = prList.find((p) => p.number === route.prNumber);
      if (pr) {
        openPR(pr);
        if (route.prFileIdx !== undefined) {
          setSelectedPRFileIdx(route.prFileIdx);
        }
      }
    }
  }, [currentRepo, selectedBranch, prList, setCurrentRepo, openFile, openPR]);

  // Handle hash route on mount and hashchange (back/forward)
  useEffect(() => {
    // Initial hash navigation
    if (window.location.hash) {
      const route = parseHash(window.location.hash);
      if (route.type !== "none" && githubToken) {
        navigateToHash(window.location.hash);
      } else if (route.type !== "none" && isDemoMode && route.type === "file") {
        // Demo mode file navigation
        const route = parseHash(window.location.hash);
        if (route.filePath) {
          const mockFile = findFile(mockFiles, route.filePath);
          if (mockFile) {
            openFile(mockFile);
          }
        }
      }
    }

    const onHashChange = () => {
      if (suppressHashChange.current) return;
      navigateToHash(window.location.hash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [githubToken, isDemoMode, navigateToHash, openFile]);

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
        defaultBranch,
        selectedBranch,
        availableBranches,
        setSelectedBranch,
        setCurrentRepo,
        repoFiles: repoFilesList,
        pullRequests: prList,
        prStateFilter,
        setPRStateFilter,
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
        setSelectedPRFileIdx: setSelectedPRFileIdxWithHash,
        loadingPRFiles,
        loadingFiles,
        loadingPRs,
        loadingContent,
        error,
        prBranchForNewFile,
        prNumberForNewFile,
        refreshRepo,
        openFile,
        openPR,
        createNewFile,
        addFileToPR,
        openLocalFile,
        isEmbedded,
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
