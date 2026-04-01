# Setting Up a GitHub Personal Access Token for MarDoc

MarDoc connects to GitHub using a **fine-grained Personal Access Token (PAT)**. This guide walks through creating one with the minimum permissions MarDoc needs.

## Why a PAT?

MarDoc runs entirely in your browser — there's no server. Your token is stored in your browser's local storage and used to call the GitHub API directly. It never leaves your machine.

## Step-by-step

### 1. Open GitHub token settings

Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) (Settings > Developer settings > Personal access tokens > Fine-grained tokens).

### 2. Click "Generate new token"

Give it a descriptive name like `MarDoc` so you remember what it's for.

### 3. Set expiration

Choose an expiration that matches your comfort level. You can always create a new one when it expires. MarDoc will prompt you to reconnect if your token stops working.

### 4. Select repository access

Choose which repositories MarDoc can see:

- **All repositories** — convenient if you review docs across many repos
- **Only select repositories** — more restrictive; pick the specific repos you want to review

### 5. Set permissions

Under **Repository permissions**, enable:

| Permission | Access level | Why MarDoc needs it |
|---|---|---|
| **Contents** | Read | Browse repository files and read markdown content |
| **Pull requests** | Read and Write | List PRs, read PR diffs, and post review comments |
| **Issues** | Read and Write | *(Optional)* Only needed if you want to reference issues |

All other permissions can stay at "No access."

### 6. Generate and copy

Click **Generate token**, then copy the token immediately — GitHub only shows it once.

### 7. Paste into MarDoc

1. Go to [mardoc.app](https://mardoc.app)
2. Click the gear icon (Settings)
3. Paste your token and click **Connect**
4. Select a repository from the list

Your token is saved in your browser so you won't need to re-enter it on your next visit.

## Revoking access

To revoke MarDoc's access at any time:

- **In MarDoc** — open Settings and click **Disconnect**. This removes the token from your browser.
- **On GitHub** — go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) and delete the token. This immediately revokes API access.

## Troubleshooting

**"Failed to load repository"** — Your token may not have access to that repo. Check that the repository is included in your token's repository access scope.

**"Not authenticated"** — Your token may have expired. Create a new one and reconnect.

**No pull requests showing** — Make sure the Pull requests permission is set to at least Read.

**Can't post comments** — Pull requests permission needs Read and Write, not just Read.
