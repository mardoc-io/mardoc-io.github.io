# Setting Up a GitHub Personal Access Token for MarDoc

MarDoc connects to GitHub using a **Personal Access Token (PAT)**. The simplest path is a **classic token** with the `repo` scope — one checkbox, done. Fine-grained tokens also work if you need tighter scope control, but they're fiddlier to configure.

## Why a PAT?

MarDoc runs entirely in your browser — there's no server. Your token is stored in your browser's local storage and used to call the GitHub API directly. It never leaves your machine.

## Step-by-step (classic token)

### 1. Open GitHub token settings

Go to [github.com/settings/tokens](https://github.com/settings/tokens) (Settings → Developer settings → Personal access tokens → Tokens (classic)).

### 2. Click "Generate new token" → "Generate new token (classic)"

Give it a descriptive name like `MarDoc` so you remember what it's for.

### 3. Set an expiration

Choose an expiration that matches your comfort level — 90 days is a reasonable default. You can always create a new one when it expires. MarDoc will prompt you to reconnect if your token stops working.

### 4. Select scopes

Check two boxes:

- **`repo`** — full read/write on any repository you already have access to. Checking this top-level box ticks all six sub-scopes automatically.
- **`read:org`** — needed if any of the repositories you want to review belong to a GitHub organization. In theory the `repo` scope alone is enough; in practice organization repos (and anything behind SAML SSO) need `read:org` to show up reliably in MarDoc's repo picker. If every repo you review is in your personal account, you can skip this one.

```
✅ repo
  ✅ repo:status
  ✅ repo_deployment
  ✅ public_repo
  ✅ repo:invite
  ✅ security_events
✅ read:org              ← check this if you want to see org repos
```

Leave everything else unchecked.

**One extra step for SSO-protected orgs**: after generating the token, the token list page will show a **Configure SSO** button next to it. Click that and authorize the specific organization(s) whose repos you want to review. Without this step, SSO orgs will silently not appear even with both scopes set.

### 5. Generate and copy

Click **Generate token** at the bottom, then copy the token immediately — GitHub only shows it once. It starts with `ghp_`. Store it somewhere safe (a password manager is ideal).

### 6. Paste into MarDoc

1. Go to [mardoc.app](https://mardoc.app)
2. Click the gear icon (Settings)
3. Paste your token and click **Connect**
4. Select a repository from the list

Your token is saved in your browser so you won't need to re-enter it on your next visit.

## Alternative: fine-grained tokens

Fine-grained tokens are the newer GitHub model — they scope to specific repositories and specific permissions rather than a single monolithic `repo` scope. They work with MarDoc, but the setup is more involved and easy to get wrong.

If you still want one, go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) and configure:

| Permission | Access level | Why MarDoc needs it |
|---|---|---|
| **Contents** | Read | Browse repository files and read markdown content |
| **Pull requests** | Read and Write | List PRs, read PR diffs, and post review comments |
| **Issues** | Read and Write | *(Optional)* Only needed if you want to reference issues |

Under **Repository access**, pick the specific repositories MarDoc should see, or "All repositories" if you want it broad. All other permissions can stay at "No access."

If a fine-grained token isn't letting MarDoc see a repo it should — or the PR list comes up empty even though PRs exist — it's almost always a missing permission or a repository that wasn't included in the token's scope. A classic token with `repo` sidesteps all of that.

## Revoking access

To revoke MarDoc's access at any time:

- **In MarDoc** — open Settings and click **Disconnect**. This removes the token from your browser.
- **On GitHub** — go to [github.com/settings/tokens](https://github.com/settings/tokens) and delete the token. This immediately revokes API access.

## Troubleshooting

**"Bad credentials"** — Double-check that you copied the full token (classic tokens start with `ghp_`). If it looks right, the token may have expired — regenerate it and reconnect.

**"Failed to load repository" or org repos missing from the picker** — Almost always one of three things:
1. Your token doesn't have `read:org` — regenerate with that box checked (Step 4).
2. The organization uses SAML SSO and you haven't authorized the token for it — go back to [github.com/settings/tokens](https://github.com/settings/tokens), click **Configure SSO** next to your token, and authorize each org.
3. You don't actually have access to that repo on github.com itself (check in a browser first).

**No pull requests showing** — For classic tokens, make sure `repo` is checked. For fine-grained tokens, **Pull requests** needs to be set to at least Read.

**Can't post comments** — For fine-grained tokens, **Pull requests** needs to be Read **and Write**, not just Read. Classic tokens handle this automatically under `repo`.
