"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  GitMerge,
  ChevronRight,
  ChevronDown,
  Plus,
  Loader2,
  FilePlus,
  FileMinus,
  FileEdit,
  FolderInput,
  Search,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
} from "lucide-react";
import { RepoFile, PRFile } from "@/types";
import { useApp } from "@/lib/app-context";

// ─── Repo file tree item ──────────────────────────────────────────────────

function FileTreeItem({
  file,
  depth,
  onSelect,
  selectedPath,
}: {
  file: RepoFile;
  depth: number;
  onSelect: (file: RepoFile) => void;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = file.path === selectedPath;

  if (file.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
          )}
          {expanded ? (
            <FolderOpen size={14} className="text-[var(--accent)] shrink-0" />
          ) : (
            <Folder size={14} className="text-[var(--accent)] shrink-0" />
          )}
          <span className="text-[var(--text-primary)] truncate">{file.name}</span>
        </button>
        {expanded && file.children && (
          <div>
            {file.children.map((child) => (
              <FileTreeItem
                key={child.id}
                file={child}
                depth={depth + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(file)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-colors ${
        isSelected
          ? "bg-[var(--accent-muted)] text-[var(--accent)]"
          : "hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]"
      }`}
      style={{ paddingLeft: `${depth * 16 + 8 + 18}px` }}
    >
      <FileText size={14} className="shrink-0" />
      <span className="truncate">{file.name}</span>
    </button>
  );
}

// ─── PR changed files tree ────────────────────────────────────────────────

interface PRFileTreeNode {
  name: string;
  path: string;
  type: "folder" | "file";
  children: PRFileTreeNode[];
  fileIdx?: number;
  status?: PRFile["status"];
}

function buildPRFileTree(files: PRFile[]): PRFileTreeNode[] {
  const root: PRFileTreeNode[] = [];
  const dirMap = new Map<string, PRFileTreeNode>();

  for (let i = 0; i < files.length; i++) {
    const parts = files[i].path.split("/");
    let currentLevel = root;

    // Create directory nodes
    for (let j = 0; j < parts.length - 1; j++) {
      const dirPath = parts.slice(0, j + 1).join("/");
      let dirNode = dirMap.get(dirPath);
      if (!dirNode) {
        dirNode = { name: parts[j], path: dirPath, type: "folder", children: [] };
        dirMap.set(dirPath, dirNode);
        currentLevel.push(dirNode);
      }
      currentLevel = dirNode.children;
    }

    // Add file node
    currentLevel.push({
      name: parts[parts.length - 1],
      path: files[i].path,
      type: "file",
      children: [],
      fileIdx: i,
      status: files[i].status,
    });
  }

  return root;
}

const statusIcon = (status: PRFile["status"]) => {
  switch (status) {
    case "added":
      return <FilePlus size={14} className="text-green-500 shrink-0" />;
    case "deleted":
      return <FileMinus size={14} className="text-red-500 shrink-0" />;
    default:
      return <FileEdit size={14} className="text-yellow-500 shrink-0" />;
  }
};

function PRFileTreeItem({
  node,
  depth,
  selectedIdx,
  onSelect,
}: {
  node: PRFileTreeNode;
  depth: number;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-[var(--text-muted)] shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-[var(--text-muted)] shrink-0" />
          )}
          {expanded ? (
            <FolderOpen size={14} className="text-[var(--accent)] shrink-0" />
          ) : (
            <Folder size={14} className="text-[var(--accent)] shrink-0" />
          )}
          <span className="text-[var(--text-primary)] truncate text-xs">{node.name}</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => (
              <PRFileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedIdx={selectedIdx}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = node.fileIdx === selectedIdx;

  return (
    <button
      onClick={() => node.fileIdx !== undefined && onSelect(node.fileIdx)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors ${
        isSelected
          ? "bg-[var(--accent-muted)] text-[var(--accent)]"
          : "hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]"
      }`}
      style={{ paddingLeft: `${depth * 14 + 8 + 16}px` }}
    >
      {statusIcon(node.status!)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────

export default function Sidebar() {
  const {
    repoFiles,
    pullRequests,
    currentRepo,
    isDemoMode,
    loadingFiles,
    loadingPRs,
    openFile,
    openPR,
    createNewFile,
    addFileToPR,
    openLocalFile,
    prStateFilter,
    setPRStateFilter,
    setCurrentView,
    selectedFile,
    selectedPR,
    currentView,
    prFiles,
    selectedPRFileIdx,
    setSelectedPRFileIdx,
    loadingPRFiles,
    selectedBranch,
    availableBranches,
    setSelectedBranch,
    isEmbedded,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"files" | "prs">("files");
  const [prFileFilter, setPRFileFilter] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // Switch to PRs tab once embed mode is detected (deferred via useEffect)
  useEffect(() => {
    if (isEmbedded) setActiveTab("prs");
  }, [isEmbedded]);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLocalFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      openLocalFile(file.name, reader.result as string);
    };
    reader.readAsText(file);

    // Reset so the same file can be re-selected
    e.target.value = "";
  }, [openLocalFile]);

  // Close branch dropdown on outside click
  useEffect(() => {
    if (!branchDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [branchDropdownOpen]);

  const isViewingPR = currentView === "pr-diff" && selectedPR;

  // Auto-switch to Files tab when a PR is opened (to show changed files)
  React.useEffect(() => {
    if (isViewingPR) {
      setActiveTab("files");
      setPRFileFilter("");
    }
  }, [isViewingPR]);

  // Build PR file tree, filtered
  const prFileTree = useMemo(() => {
    if (!isViewingPR) return [];
    const filtered = prFileFilter.trim()
      ? prFiles.filter((f) => f.path.toLowerCase().includes(prFileFilter.toLowerCase()))
      : prFiles;
    return buildPRFileTree(filtered);
  }, [isViewingPR, prFiles, prFileFilter]);

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 h-full border-r border-[var(--border)] bg-[var(--surface-secondary)] flex flex-col items-center pt-2">
        <button
          onClick={() => setCollapsed(false)}
          className="toolbar-btn"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      </aside>
    );
  }

  // Width: fixed 256px on desktop, fills its parent on mobile so a
  // MobileDrawer host can pick the drawer width.
  return (
    <aside className="w-full md:w-64 md:shrink-0 h-full border-r border-[var(--border)] bg-[var(--surface-secondary)] flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {(!isEmbedded || isViewingPR) && (
          <button
            onClick={() => setActiveTab("files")}
            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "files"
                ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <FileText size={14} />
              {isEmbedded ? "Changed Files" : "Files"}
            </span>
          </button>
        )}
        <button
          onClick={() => setActiveTab("prs")}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "prs"
              ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <GitPullRequest size={14} />
            PRs
          </span>
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="px-2 py-2.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Branch selector — visible on Files tab when browsing repo (not PR) */}
      {activeTab === "files" && !isViewingPR && availableBranches.length > 0 && (
        <div ref={branchDropdownRef} className="relative px-2 py-1.5 border-b border-[var(--border)]">
          <button
            onClick={() => {
              setBranchDropdownOpen(!branchDropdownOpen);
              setBranchFilter("");
            }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors text-[var(--text-primary)]"
          >
            <GitBranch size={12} className="text-[var(--text-muted)] shrink-0" />
            <span className="truncate flex-1 text-left">{selectedBranch}</span>
            <ChevronDown size={12} className={`text-[var(--text-muted)] shrink-0 transition-transform ${branchDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {branchDropdownOpen && (
            <div className="absolute left-2 right-2 top-full mt-1 z-50 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg max-h-64 flex flex-col">
              {availableBranches.length > 5 && (
                <div className="p-1.5 border-b border-[var(--border)]">
                  <input
                    type="text"
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    placeholder="Filter branches..."
                    className="w-full px-2 py-1 text-xs rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                </div>
              )}
              <div className="overflow-y-auto">
                {availableBranches
                  .filter((b) => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))
                  .map((branch) => (
                    <button
                      key={branch.name}
                      onClick={() => {
                        setSelectedBranch(branch.name);
                        setBranchDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-left transition-colors ${
                        branch.name === selectedBranch
                          ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      {branch.name === selectedBranch ? (
                        <Check size={12} className="shrink-0" />
                      ) : (
                        <span className="w-3 shrink-0" />
                      )}
                      <span className="truncate">{branch.name}</span>
                      {branch.isDefault && (
                        <span className="ml-auto text-[10px] text-[var(--text-muted)] shrink-0">default</span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "files" ? (
          // When viewing a PR, show changed files; otherwise show repo tree
          isViewingPR ? (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  Changed files
                  {prFiles.length > 0 && (
                    <span className="text-[var(--text-muted)] font-normal ml-1">
                      ({prFiles.length})
                    </span>
                  )}
                </span>
                {selectedPR && selectedPR.status === "open" && (
                  <button
                    onClick={() => addFileToPR(selectedPR)}
                    className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                    title="Add a new file to this PR"
                  >
                    <FilePlus size={12} />
                    Add file
                  </button>
                )}
              </div>

              {/* Filter */}
              {prFiles.length > 3 && (
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={prFileFilter}
                    onChange={(e) => setPRFileFilter(e.target.value)}
                    placeholder="Filter files..."
                    className="w-full pl-7 pr-7 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  {prFileFilter && (
                    <button
                      onClick={() => setPRFileFilter("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              )}

              {loadingPRFiles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
                </div>
              ) : prFileTree.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-4">
                  {prFileFilter ? "No files matching filter." : "No document files changed."}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {prFileTree.map((node) => (
                    <PRFileTreeItem
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedIdx={selectedPRFileIdx}
                      onSelect={setSelectedPRFileIdx}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : loadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : repoFiles.length === 0 ? (
            <div className="text-center py-8 px-3">
              <p className="text-sm text-[var(--text-muted)]">
                {currentRepo
                  ? "No document files found in this repository."
                  : "Open Settings to connect a repository."}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {!isEmbedded && (
                <div className="flex items-center gap-1 mb-1">
                  <button
                    onClick={createNewFile}
                    className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs rounded-md text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <FilePlus size={14} />
                    New File
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors"
                    title="Open a local .md file"
                  >
                    <FolderInput size={14} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.mdx,.markdown,.html,.htm"
                    onChange={handleLocalFileSelect}
                    className="hidden"
                  />
                </div>
              )}
              {repoFiles.map((file) => (
                <FileTreeItem
                  key={file.id}
                  file={file}
                  depth={0}
                  onSelect={(f) => openFile(f)}
                  selectedPath={selectedFile?.path || null}
                />
              ))}
            </div>
          )
        ) : loadingPRs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : (
          <div className="space-y-1">
            {/* State filter */}
            <div className="flex items-center gap-1 px-1 mb-2">
              {(["open", "closed", "all"] as const).map((state) => (
                <button
                  key={state}
                  onClick={() => setPRStateFilter(state)}
                  className={`flex-1 text-[10px] py-1 rounded transition-colors capitalize ${
                    prStateFilter === state
                      ? "bg-[var(--accent-muted)] text-[var(--accent)] font-medium"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {state}
                </button>
              ))}
            </div>

            {/* Create review PR button */}
            <button
              onClick={() => setCurrentView("pr-review")}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors mb-2"
            >
              <Plus size={14} />
              New Review
            </button>

            {pullRequests.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">
                No pull requests found.
              </p>
            ) : (
              pullRequests.map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => openPR(pr)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                    selectedPR?.id === pr.id
                      ? "bg-[var(--accent-muted)]"
                      : "hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {pr.status === "merged" ? (
                      <GitMerge size={14} className="text-purple-500 shrink-0 mt-0.5" />
                    ) : pr.status === "closed" ? (
                      <GitPullRequest size={14} className="text-red-500 shrink-0 mt-0.5" />
                    ) : (
                      <GitPullRequest size={14} className="text-green-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--text-primary)] truncate">
                        {pr.title}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                        <span>#{pr.number} by {pr.author}</span>
                        {pr.mdFileCount !== undefined && pr.mdFileCount > 0 && (
                          <span className="text-[9px] px-1.5 py-0 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] font-medium">
                            {pr.mdFileCount} md
                          </span>
                        )}
                        {pr.mdFileCount === 0 && (
                          <span className="text-[9px] px-1.5 py-0 rounded-full bg-[var(--surface-secondary)] text-[var(--text-muted)]">
                            no md
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="text-xs text-[var(--text-muted)] font-mono truncate">
          {currentRepo || "demo mode"}
        </div>
        {isDemoMode && (
          <div className="text-xs text-[var(--accent)] mt-0.5">
            Using sample data
          </div>
        )}
      </div>
    </aside>
  );
}
