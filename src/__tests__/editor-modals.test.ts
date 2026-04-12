/**
 * Characterization tests for NewFileModal and EditPRModal.
 *
 * Both modals were extracted from Editor.tsx as presentational
 * components. These tests pin the observable contract — what
 * renders, what the buttons do, when they're disabled — so future
 * refactors of Editor.tsx or the modals themselves can't silently
 * regress the save/commit/PR flow.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NewFileModal from "@/components/NewFileModal";
import EditPRModal from "@/components/EditPRModal";

const e = React.createElement;

afterEach(() => cleanup());

// ─── NewFileModal ────────────────────────────────────────────────────

function mountNewFile(
  overrides: Partial<React.ComponentProps<typeof NewFileModal>> = {}
) {
  return render(
    e(NewFileModal, {
      open: true,
      onClose: () => {},
      filePath: "",
      onFilePathChange: () => {},
      title: "",
      onTitleChange: () => {},
      isAddingToPR: false,
      isDemoMode: false,
      saving: false,
      error: null,
      onSubmit: () => {},
      ...overrides,
    } as React.ComponentProps<typeof NewFileModal>)
  );
}

describe("NewFileModal — render gate", () => {
  it("renders nothing when open=false", () => {
    const { container } = mountNewFile({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders the dialog when open=true", () => {
    mountNewFile({ open: true });
    expect(screen.getByText("Save to Repository")).toBeTruthy();
  });
});

describe("NewFileModal — fresh-PR mode (not adding to existing)", () => {
  it("shows File path and PR title inputs", () => {
    mountNewFile({ isAddingToPR: false });
    expect(screen.getByText("File path")).toBeTruthy();
    expect(screen.getByText("PR title")).toBeTruthy();
  });

  it("shows 'Create PR' button label", () => {
    mountNewFile({ isAddingToPR: false });
    expect(screen.getByText("Create PR")).toBeTruthy();
  });

  it("disables submit when filePath is empty", () => {
    mountNewFile({ isAddingToPR: false, filePath: "", title: "my title" });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("disables submit when title is empty", () => {
    mountNewFile({ isAddingToPR: false, filePath: "docs/x.md", title: "" });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables submit when both filePath and title are set", () => {
    mountNewFile({ isAddingToPR: false, filePath: "docs/x.md", title: "Add docs" });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it(".md-append hint appears when path doesn't end in .md", () => {
    mountNewFile({ filePath: "docs/x" });
    expect(screen.getByText(/.md will be appended/)).toBeTruthy();
  });

  it("no .md-append hint when path already ends in .md", () => {
    mountNewFile({ filePath: "docs/x.md" });
    expect(screen.queryByText(/.md will be appended/)).toBeNull();
  });
});

describe("NewFileModal — adding-to-PR mode", () => {
  it("shows PR number in the header", () => {
    mountNewFile({
      isAddingToPR: true,
      addingToPRNumber: 42,
      addingToPRBranch: "feat/docs",
    });
    expect(screen.getByText(/PR #42/)).toBeTruthy();
  });

  it("shows the target branch name", () => {
    mountNewFile({
      isAddingToPR: true,
      addingToPRNumber: 42,
      addingToPRBranch: "feat/docs",
    });
    expect(screen.getByText("feat/docs")).toBeTruthy();
  });

  it("hides the PR title input (commit doesn't need a new PR title)", () => {
    mountNewFile({ isAddingToPR: true });
    expect(screen.queryByText("PR title")).toBeNull();
  });

  it("shows 'Commit to PR' button label", () => {
    mountNewFile({ isAddingToPR: true });
    expect(screen.getByText("Commit to PR")).toBeTruthy();
  });

  it("enables submit when filePath is set even if title is empty", () => {
    mountNewFile({
      isAddingToPR: true,
      filePath: "docs/x.md",
      title: "",
    });
    const btn = screen.getByText("Commit to PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("NewFileModal — demo mode", () => {
  it("shows demo-mode warning banner", () => {
    mountNewFile({ isDemoMode: true });
    expect(screen.getByText(/Connect a GitHub repository/i)).toBeTruthy();
  });

  it("disables submit when in demo mode even with valid inputs", () => {
    mountNewFile({
      isDemoMode: true,
      filePath: "docs/x.md",
      title: "Add",
    });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("NewFileModal — saving state", () => {
  it("shows 'Committing...' label while saving", () => {
    mountNewFile({
      saving: true,
      filePath: "docs/x.md",
      title: "Add",
    });
    expect(screen.getByText("Committing...")).toBeTruthy();
  });

  it("disables submit while saving", () => {
    mountNewFile({
      saving: true,
      filePath: "docs/x.md",
      title: "Add",
    });
    const btn = screen.getByText("Committing...").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("NewFileModal — error and interactions", () => {
  it("displays an error message when error is set", () => {
    mountNewFile({ error: "Branch name already exists" });
    expect(screen.getByText("Branch name already exists")).toBeTruthy();
  });

  it("onClose fires when Cancel is clicked", () => {
    const onClose = vi.fn();
    mountNewFile({ onClose });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("onFilePathChange fires on input change", () => {
    const onFilePathChange = vi.fn();
    mountNewFile({ onFilePathChange });
    const input = screen.getByPlaceholderText(/docs\/my-document/);
    fireEvent.change(input, { target: { value: "README.md" } });
    expect(onFilePathChange).toHaveBeenCalledWith("README.md");
  });

  it("Enter in the path input fires onSubmit when the submit would be enabled", () => {
    const onSubmit = vi.fn();
    mountNewFile({
      onSubmit,
      filePath: "docs/x.md",
      title: "Add docs",
    });
    const input = screen.getByPlaceholderText(/docs\/my-document/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Enter does NOT fire onSubmit when inputs are incomplete", () => {
    const onSubmit = vi.fn();
    mountNewFile({ onSubmit, filePath: "", title: "" });
    const input = screen.getByPlaceholderText(/docs\/my-document/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ─── EditPRModal ─────────────────────────────────────────────────────

function mountEditPR(
  overrides: Partial<React.ComponentProps<typeof EditPRModal>> = {}
) {
  return render(
    e(EditPRModal, {
      open: true,
      onClose: () => {},
      title: "",
      onTitleChange: () => {},
      isLocalFile: false,
      filePath: "README.md",
      editFilePath: "",
      onEditFilePathChange: () => {},
      submitting: false,
      error: null,
      onSubmit: () => {},
      ...overrides,
    } as React.ComponentProps<typeof EditPRModal>)
  );
}

describe("EditPRModal — render gate", () => {
  it("renders nothing when open=false", () => {
    const { container } = mountEditPR({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders the dialog when open=true", () => {
    mountEditPR({ open: true });
    expect(screen.getByText("Submit Edits as PR")).toBeTruthy();
  });
});

describe("EditPRModal — repo-file mode", () => {
  it("does NOT show the file-path input", () => {
    mountEditPR({ isLocalFile: false, filePath: "README.md" });
    expect(screen.queryByText("File path in repo")).toBeNull();
  });

  it("shows the source filePath in the description", () => {
    mountEditPR({ isLocalFile: false, filePath: "docs/foo.md" });
    expect(screen.getByText("docs/foo.md")).toBeTruthy();
  });

  it("enables submit when title is set", () => {
    mountEditPR({ isLocalFile: false, title: "Fix typo" });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("disables submit when title is empty", () => {
    mountEditPR({ isLocalFile: false, title: "" });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("EditPRModal — local-file mode", () => {
  it("shows the file-path input for local files", () => {
    mountEditPR({ isLocalFile: true, editFilePath: "docs/new.md" });
    expect(screen.getByText("File path in repo")).toBeTruthy();
  });

  it("shows the local-file description text", () => {
    mountEditPR({ isLocalFile: true });
    expect(screen.getByText(/This local file will be committed/i)).toBeTruthy();
  });

  it("disables submit when editFilePath is empty", () => {
    mountEditPR({
      isLocalFile: true,
      editFilePath: "",
      title: "Add new",
    });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("disables submit when title is empty", () => {
    mountEditPR({
      isLocalFile: true,
      editFilePath: "docs/new.md",
      title: "",
    });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables submit when both editFilePath and title are set", () => {
    mountEditPR({
      isLocalFile: true,
      editFilePath: "docs/new.md",
      title: "Add new doc",
    });
    const btn = screen.getByText("Create PR").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("EditPRModal — submitting state", () => {
  it("shows 'Creating...' label while submitting", () => {
    mountEditPR({ submitting: true, title: "Update" });
    expect(screen.getByText("Creating...")).toBeTruthy();
  });

  it("disables submit while submitting", () => {
    mountEditPR({ submitting: true, title: "Update" });
    const btn = screen.getByText("Creating...").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("EditPRModal — error and interactions", () => {
  it("displays error message when error is set", () => {
    mountEditPR({ error: "API rate limit" });
    expect(screen.getByText("API rate limit")).toBeTruthy();
  });

  it("onClose fires on Cancel", () => {
    const onClose = vi.fn();
    mountEditPR({ onClose });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("onTitleChange fires on title input change", () => {
    const onTitleChange = vi.fn();
    mountEditPR({ onTitleChange });
    const input = screen.getByPlaceholderText(/Update README/);
    fireEvent.change(input, { target: { value: "Fix grammar" } });
    expect(onTitleChange).toHaveBeenCalledWith("Fix grammar");
  });

  it("Enter in the title input fires onSubmit", () => {
    const onSubmit = vi.fn();
    mountEditPR({ onSubmit, title: "Update docs" });
    const input = screen.getByPlaceholderText(/Update README/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Enter does NOT fire onSubmit when title is empty", () => {
    const onSubmit = vi.fn();
    mountEditPR({ onSubmit, title: "" });
    const input = screen.getByPlaceholderText(/Update README/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
