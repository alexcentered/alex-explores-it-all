# PR Preview Deployments

This repository is configured to automatically deploy preview versions of the site for every pull request using Cloudflare Pages.

## How It Works

When a pull request is opened, updated, or reopened:

1. A GitHub Actions workflow triggers automatically
2. The workflow deploys the PR's changes to Cloudflare Pages with a unique URL
3. A comment is posted on the PR with the preview link
4. Each subsequent push to the PR updates the same preview deployment

**Production site** (`alexexploresitall.com`) continues to be served via GitHub Pages and is only updated when changes are merged to `main`.

## Initial Setup

To enable preview deployments, you need to configure Cloudflare credentials as GitHub repository secrets.

### Step 1: Create a Cloudflare Pages Project

1. Log in to your [Cloudflare dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Click **Create application** → **Pages** → **Connect to Git**
4. Or use Wrangler CLI to create the project:
   ```bash
   wrangler pages project create alex-explores-it-all-preview
   ```

The project will be created the first time the workflow runs, but you'll need credentials first.

### Step 2: Get Your Cloudflare Account ID

1. In the Cloudflare dashboard, click on any domain
2. Scroll down the right sidebar — your **Account ID** is listed there
3. Copy this ID (format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

### Step 3: Create a Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template, or create a custom token with:
   - **Permissions:**
     - `Account` → `Cloudflare Pages` → `Edit`
   - **Account Resources:**
     - Include → Your account
4. Click **Continue to summary** → **Create Token**
5. **Copy the token** (you won't see it again!)

### Step 4: Add Secrets to GitHub

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add both:
   - **Name:** `CLOUDFLARE_API_TOKEN`  
     **Value:** The API token you created in Step 3
   - **Name:** `CLOUDFLARE_ACCOUNT_ID`  
     **Value:** Your account ID from Step 2

### Step 5: Test It

1. Open a new pull request (or push to an existing one)
2. The workflow will run automatically
3. Within 1-2 minutes, you'll see a comment with your preview URL!

## Preview URLs

Each PR gets a unique URL like:

```
https://<branch-name>.alex-explores-it-all-preview.pages.dev
```

Preview deployments persist until you delete them in the Cloudflare dashboard, so you can share them with others for feedback.

## Troubleshooting

### Workflow runs but no preview URL appears

- Check that both secrets are configured correctly in repository settings
- Verify your API token has `Cloudflare Pages: Edit` permission
- Check the workflow logs in the **Actions** tab for error messages

### Deployment fails with "Project not found"

The project will be created automatically on first deployment. If this fails:
1. Create it manually in the Cloudflare dashboard or with `wrangler pages project create alex-explores-it-all-preview`
2. Ensure your API token has permissions for the correct account

### Preview URL shows old content

Cloudflare Pages may cache content. Wait 1-2 minutes or hard-refresh your browser (Cmd+Shift+R or Ctrl+Shift+F5).

## Cost

Cloudflare Pages has a generous free tier:
- Unlimited requests
- Unlimited bandwidth
- 500 builds per month
- 20,000 files per deployment

This is more than sufficient for preview deployments on a personal site.
