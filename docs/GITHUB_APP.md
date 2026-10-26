# GitHub App

`repolens app` is a self-hosted webhook for a GitHub App. On a pull request it runs the same architecture diff as `repolens comment`, then posts two things:

- a Check Run named **RepoLens**, with that diff as the summary
- the existing sticky pull request comment (`<!-- repolens:architecture-diff -->`)

A finished analysis is a successful check. The check does not fail because of cycles, hubs, or a lower code-health score. It fails only when the analysis itself throws. Installation events are acknowledged and do not post a check.

This repository does not register the app. CI does not need an app id, a private key, or a webhook secret.

## Permissions

The manifest asks for only what the webhook uses:

| Permission | Access | Used for |
|---|---|---|
| Checks | write | Create the RepoLens check run |
| Pull requests | write | Create or update the architecture comment |
| Contents | read | Clone the base repository and fetch the pull request |
| Metadata | read | Required on every GitHub App |

Events: `installation`, `installation_repositories`, `pull_request`.

The files are `app.yml` (YAML) and `github-app-manifest.json` (the same document). `repolens app --manifest` prints that JSON. Both ship in the npm package.

## Register the app

1. Replace `hook_attributes.url` in `app.yml` and `github-app-manifest.json` with the public HTTPS URL of your server, including the path. The default path is `/api/github/webhooks`. The committed URL is `https://example.com/api/github/webhooks` and will not receive events.
2. Open the manifest in GitHub: [register a GitHub App from a manifest](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest). For your user account the form posts to `https://github.com/settings/apps/new`. For an organization, post to `https://github.com/organizations/ORG/settings/apps/new`. The form field name is `manifest` and the value is the JSON.
3. After GitHub creates the app, set a webhook secret on the app and copy it to `REPOLENS_WEBHOOK_SECRET`.
4. Generate a private key and save it. Note the App ID.
5. Install the app on the repositories that should receive checks. `public: false` in the manifest means only the owner can install it. Set `public` to `true` before registering if other accounts should install it.

## Run it

```bash
export REPOLENS_APP_ID=123456
export REPOLENS_WEBHOOK_SECRET='the secret from the app settings'
export REPOLENS_APP_PRIVATE_KEY_PATH=/path/to/repolens.pem
# or REPOLENS_APP_PRIVATE_KEY with the PEM. A literal \n in the value is turned into a newline.

npx @chappibunny/repolens app --port 8787
```

The process listens on `127.0.0.1` until you stop it. Set `REPOLENS_APP_HOST=0.0.0.0` when a reverse proxy on the same machine forwards HTTPS to it. GitHub must reach the webhook URL. A local process is not enough on its own.

`repolens app` without those three values exits 2. `repolens app --manifest` does not need them.

| Variable | Required to listen | Default |
|---|---|---|
| `REPOLENS_APP_ID` | yes | |
| `REPOLENS_WEBHOOK_SECRET` | yes | |
| `REPOLENS_APP_PRIVATE_KEY` | one of the two key vars | PEM text |
| `REPOLENS_APP_PRIVATE_KEY_PATH` | one of the two key vars | path to the PEM file. Used when set |
| `REPOLENS_APP_PORT` | no | `8787` |
| `REPOLENS_APP_HOST` | no | `127.0.0.1` |
| `REPOLENS_APP_WEBHOOK_PATH` | no | `/api/github/webhooks` |

Flags `--port`, `--host`, and `--webhook-path` override the variables.

## What GitHub sends

The server checks `X-Hub-Signature-256` against the raw body and `REPOLENS_WEBHOOK_SECRET`. A bad or missing signature is HTTP 401 and does not run the analysis.

| Event | Result |
|---|---|
| `ping` | HTTP 200 |
| `installation`, `installation_repositories` | HTTP 200. No check, no comment |
| `pull_request` `opened`, `synchronize`, `reopened`, `ready_for_review` | HTTP 202, then the diff, the check, and the comment |
| other `pull_request` actions | HTTP 200, ignored |
| anything else | HTTP 200, ignored |

GitHub waits about 10 seconds for the HTTP response. Cloning and scoring both commits can take longer, so the server answers **202** and posts the check after the work finishes. Redeliver the webhook from GitHub if that later step fails. The delivery is not retried automatically after a 202.

`GET /health` returns `{ "ok": true, "service": "repolens-github-app" }`.

## What the owner still does

Registering the app, choosing the public URL, storing the private key and webhook secret, and installing the app on repositories are account actions. They are not part of this pull request and they are not CI secrets. The composite GitHub Action (`command: comment`) is unchanged and still uses `GITHUB_TOKEN`.
