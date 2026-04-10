"use client";

import React, { useState } from "react";
import { useApp } from "@/lib/app-context";
import Sidebar from "@/components/Sidebar";
import Editor from "@/components/Editor";
import HtmlViewer from "@/components/HtmlViewer";
import PRDetail from "@/components/PRDetail";
import PRReview from "@/components/PRReview";
import SettingsPanel from "@/components/SettingsPanel";
import ThemeToggle from "@/components/ThemeToggle";
import {
  BookOpen,
  Settings,
  FileText,
  GitPullRequest,
  Loader2,
  AlertCircle,
} from "lucide-react";

export default function Home() {
  const {
    currentView,
    setCurrentView,
    selectedFile,
    selectedPR,
    setSelectedPR,
    fileContent,
    loadingContent,
    loadingPRFiles,
    error,
    isDemoMode,
    currentRepo,
    selectedBranch,
    repoFiles,
    pullRequests,
    isEmbedded,
  } = useApp();

  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-12 shrink-0 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-[var(--accent)]" />
            <span className="font-semibold text-sm text-[var(--text-primary)]">
              mardoc.app
            </span>
          </div>
          <div className="h-4 w-px bg-[var(--border)]" />
          {currentRepo ? (
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {currentRepo}
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">
              {isEmbedded ? "" : isDemoMode ? "Demo Mode" : "No repo selected"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {error && (
            <div className="flex items-center gap-1 text-xs text-red-500 mr-2">
              <AlertCircle size={12} />
              <span className="max-w-48 truncate">{error}</span>
            </div>
          )}
          {!isEmbedded && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="toolbar-btn"
              title="Settings"
            >
              <Settings size={16} />
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-hidden bg-[var(--surface)]">
          {currentView === "editor" && selectedFile ? (
            loadingContent ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Loading {selectedFile.name}...</span>
                </div>
              </div>
            ) : (
              <Editor
                content={fileContent}
                filePath={selectedFile.path}
                repoFullName={currentRepo || undefined}
                branch={selectedBranch}
                onContentChange={() => {}}
              />
            )
          ) : currentView === "html-viewer" && selectedFile ? (
            loadingContent ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Loading {selectedFile.name}...</span>
                </div>
              </div>
            ) : (
              <HtmlViewer
                content={fileContent}
                filePath={selectedFile.path}
                repoFullName={currentRepo || undefined}
                branch={selectedBranch}
              />
            )
          ) : currentView === "pr-diff" && selectedPR ? (
            loadingPRFiles ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Loading PR files...</span>
                </div>
              </div>
            ) : (
              <PRDetail
                pr={selectedPR}
                onBack={() => {
                  setSelectedPR(null);
                  setCurrentView("editor");
                }}
              />
            )
          ) : currentView === "pr-review" ? (
            <PRReview />
          ) : (
            /* Welcome screen */
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent-muted)] flex items-center justify-center mx-auto mb-5">
                  <BookOpen size={28} className="text-[var(--accent)]" />
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                  Welcome to mardoc.app
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                  {isEmbedded
                    ? "Select a pull request from the sidebar to start reviewing, or right-click a markdown file to edit with MarDoc."
                    : isDemoMode
                    ? "You're in demo mode with sample data. Open Settings to connect a GitHub repository."
                    : "Select a file from the sidebar to start editing, or open a pull request to review rendered markdown diffs."}
                </p>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <FileText size={14} />
                    <span>{repoFiles.length} files</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <GitPullRequest size={14} />
                    <span>{pullRequests.length} pull requests</span>
                  </div>
                </div>
                {isDemoMode && !isEmbedded && (
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    <Settings size={14} />
                    Connect GitHub
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Settings modal */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
