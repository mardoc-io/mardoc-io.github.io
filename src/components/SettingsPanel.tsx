"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Settings, X, Github, LogIn, LogOut, RefreshCw, Lock, Globe, Search, FolderOpen } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { fetchUserRepos } from "@/lib/github-api";
import * as safeStorage from "@/lib/safe-storage";
import {
  getImageUploadFolder,
  setImageUploadFolder,
  DEFAULT_IMAGE_FOLDER,
} from "@/lib/image-path-config";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    isAuthenticated,
    githubToken,
    setGithubToken,
    currentRepo,
    setCurrentRepo,
    isDemoMode,
  } = useApp();

  const [tokenInput, setTokenInput] = useState("");
  const [repoInput, setRepoInput] = useState(currentRepo || "");
  const [imageFolderInput, setImageFolderInput] = useState("");
  const [imageFolderSaved, setImageFolderSaved] = useState(false);
  const [userRepos, setUserRepos] = useState<
    { fullName: string; description: string; isPrivate: boolean }[]
  >([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"connect" | "repo">(
    isAuthenticated ? "repo" : "connect"
  );

  // Filter repos based on search input
  const filteredRepos = useMemo(() => {
    if (!repoFilter.trim()) return userRepos;
    const query = repoFilter.toLowerCase();
    return userRepos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(query) ||
        r.description.toLowerCase().includes(query)
    );
  }, [userRepos, repoFilter]);

  // Load the per-repo image folder setting every time the panel opens
  // or the current repo changes, so the input shows the current value.
  useEffect(() => {
    if (isOpen) {
      setImageFolderInput(getImageUploadFolder(currentRepo ?? undefined));
      setImageFolderSaved(false);
    }
  }, [isOpen, currentRepo]);

  const handleSaveImageFolder = () => {
    if (!currentRepo) return;
    setImageUploadFolder(currentRepo, imageFolderInput);
    // Re-read so the input reflects the sanitized form (e.g., trailing
    // slash stripped, invalid input bounced back to default).
    const saved = getImageUploadFolder(currentRepo);
    setImageFolderInput(saved);
    setImageFolderSaved(true);
    setTimeout(() => setImageFolderSaved(false), 1500);
  };

  // Load user repos: show cached immediately, refresh in background
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      // Show cached repos instantly
      const cached = safeStorage.getItem("mardoc_user_repos");
      if (cached) {
        try {
          setUserRepos(JSON.parse(cached));
        } catch { /* ignore corrupt cache */ }
      }

      // Fetch fresh list in background
      setLoadingRepos(!cached);
      fetchUserRepos()
        .then((repos) => {
          setUserRepos(repos);
          safeStorage.setItem("mardoc_user_repos", JSON.stringify(repos));
        })
        .catch(console.error)
        .finally(() => setLoadingRepos(false));
    }
  }, [isAuthenticated, isOpen]);

  const handleConnect = () => {
    if (tokenInput.trim()) {
      setGithubToken(tokenInput.trim());
      setActiveTab("repo");
    }
  };

  const handleDisconnect = () => {
    setGithubToken(null);
    setTokenInput("");
    setUserRepos([]);
    safeStorage.removeItem("mardoc_user_repos");
    setActiveTab("connect");
  };

  const handleSelectRepo = (repo: string) => {
    setRepoInput(repo);
    setCurrentRepo(repo);
    onClose();
  };

  const handleManualRepo = () => {
    if (repoInput.trim()) {
      setCurrentRepo(repoInput.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-black/40 bg-[var(--surface)]">
      <div className="bg-[var(--surface)] w-full h-full flex flex-col md:h-auto md:max-h-[80vh] md:max-w-lg md:rounded-xl md:shadow-2xl md:border md:border-[var(--border)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[var(--text-secondary)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="toolbar-btn"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] px-5">
          <button
            onClick={() => setActiveTab("connect")}
            className={`px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "connect"
                ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            GitHub Connection
          </button>
          <button
            onClick={() => setActiveTab("repo")}
            className={`px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "repo"
                ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Repository
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "connect" ? (
            <div className="space-y-4">
              {isAuthenticated ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Github size={16} className="text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Connected to GitHub</p>
                      <p className="text-xs text-[var(--text-muted)]">Token active</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-2 text-sm px-3 py-2 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut size={14} />
                    Disconnect
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-[var(--text-secondary)] mb-3">
                    Connect with a GitHub Personal Access Token to browse real repositories.
                    The app also works in demo mode with sample data.
                  </p>

                  <div className="bg-[var(--surface-secondary)] rounded-lg p-3 mb-4">
                    <p className="text-xs text-[var(--text-secondary)] mb-2">
                      <strong>How to create a classic token:</strong>
                    </p>
                    <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal ml-4">
                      <li>Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</li>
                      <li>Click "Generate new token" → "Generate new token (classic)"</li>
                      <li>Give it a note (e.g. "MarDoc") and set an expiration</li>
                      <li>
                        Check <strong>repo</strong> (reading code, PRs, and review comments)
                        and <strong>read:org</strong> (if you want to see any organization
                        repos — skip only if every repo is in your personal account)
                      </li>
                      <li>
                        Click "Generate token", then if any of your orgs use SSO click
                        <strong> Configure SSO</strong> next to the token and authorize each one
                      </li>
                      <li>Copy the <code className="px-1 rounded bg-[var(--surface)]">ghp_…</code> value and paste below</li>
                    </ol>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 italic">
                      Classic tokens are simpler than fine-grained ones — one scope, one click.
                      If you already have a fine-grained token with Contents + Pull Requests +
                      Issues permissions, it will also work.
                    </p>
                  </div>

                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                    Personal Access Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="ghp_..."
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleConnect();
                      }}
                    />
                    <button
                      onClick={handleConnect}
                      disabled={!tokenInput.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
                    >
                      <LogIn size={14} />
                      Connect
                    </button>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">
                      Your token never leaves your browser. MarDoc runs entirely client-side — there is no server.
                      Your token is stored in local storage and used to call the GitHub API directly from your machine.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Manual repo input */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Repository (owner/name or full URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="e.g., mardoc-io/mardoc-io.github.io"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleManualRepo();
                    }}
                  />
                  <button
                    onClick={handleManualRepo}
                    disabled={!repoInput.trim()}
                    className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
                  >
                    Open
                  </button>
                </div>
              </div>

              {/* User repos list */}
              {isAuthenticated && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]">
                      Your repositories
                      {userRepos.length > 0 && (
                        <span className="text-[var(--text-muted)] font-normal ml-1">
                          ({filteredRepos.length}{repoFilter ? ` of ${userRepos.length}` : ""})
                        </span>
                      )}
                    </label>
                    <button
                      onClick={() => {
                        setLoadingRepos(true);
                        fetchUserRepos()
                          .then((repos) => {
                            setUserRepos(repos);
                            safeStorage.setItem("mardoc_user_repos", JSON.stringify(repos));
                          })
                          .catch(console.error)
                          .finally(() => setLoadingRepos(false));
                      }}
                      className="toolbar-btn"
                      title="Refresh"
                    >
                      <RefreshCw size={12} className={loadingRepos ? "animate-spin" : ""} />
                    </button>
                  </div>

                  {/* Search/filter input */}
                  {userRepos.length > 0 && (
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        value={repoFilter}
                        onChange={(e) => setRepoFilter(e.target.value)}
                        placeholder="Filter repositories..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                      />
                      {repoFilter && (
                        <button
                          onClick={() => setRepoFilter("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  {loadingRepos ? (
                    <div className="text-sm text-[var(--text-muted)] py-4 text-center">
                      Loading repositories...
                    </div>
                  ) : filteredRepos.length > 0 ? (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {filteredRepos.map((repo) => (
                        <button
                          key={repo.fullName}
                          onClick={() => handleSelectRepo(repo.fullName)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            currentRepo === repo.fullName
                              ? "bg-[var(--accent-muted)] border border-[var(--accent)]"
                              : "hover:bg-[var(--surface-hover)] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {repo.isPrivate ? (
                              <Lock size={12} className="text-[var(--text-muted)]" />
                            ) : (
                              <Globe size={12} className="text-[var(--text-muted)]" />
                            )}
                            <span className="text-sm font-mono text-[var(--text-primary)]">
                              {repo.fullName}
                            </span>
                          </div>
                          {repo.description && (
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 ml-5 truncate">
                              {repo.description}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : userRepos.length > 0 ? (
                    <p className="text-sm text-[var(--text-muted)] py-2 text-center">
                      No repos matching &ldquo;{repoFilter}&rdquo;
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] py-2">
                      No repositories found. Try entering a repo name manually above.
                    </p>
                  )}
                </div>
              )}

              {/* Image upload folder — configurable per repo. The
                  paste / drag-drop flow commits images under this
                  folder; defaults to docs/images. */}
              {currentRepo && (
                <div className="pt-4 border-t border-[var(--border)]">
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <FolderOpen size={14} className="text-[var(--text-muted)]" />
                      Image upload folder
                    </span>
                  </label>
                  <p className="text-xs text-[var(--text-muted)] mb-2">
                    Where paste / drag-drop uploads commit in{" "}
                    <span className="font-mono">{currentRepo}</span>.
                    Default: <span className="font-mono">{DEFAULT_IMAGE_FOLDER}</span>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={imageFolderInput}
                      onChange={(e) => {
                        setImageFolderInput(e.target.value);
                        setImageFolderSaved(false);
                      }}
                      placeholder={DEFAULT_IMAGE_FOLDER}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveImageFolder();
                      }}
                    />
                    <button
                      onClick={handleSaveImageFolder}
                      className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      {imageFolderSaved ? "Saved ✓" : "Save"}
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                    Examples: <span className="font-mono">docs/images</span>,{" "}
                    <span className="font-mono">docs/assets</span>,{" "}
                    <span className="font-mono">src/assets/img</span>,{" "}
                    <span className="font-mono">public/images</span>
                  </p>
                </div>
              )}

              {!isAuthenticated && (
                <div className="bg-[var(--accent-muted)] rounded-lg p-3">
                  <p className="text-xs text-[var(--accent)]">
                    Connect your GitHub account in the "GitHub Connection" tab to browse your repositories.
                    You can also type any public repo name above.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
