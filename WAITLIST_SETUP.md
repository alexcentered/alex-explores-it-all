# Waitlist Form Setup Guide

This guide walks you through setting up the waitlist form backend using Google Apps Script. The form will save signups to a Google Sheet and email you for each new signup.

## What You'll Get

- A Google Sheet that collects all waitlist signups with timestamps
- Email notifications sent to alexcentered@gmail.com for each signup
- Automatic duplicate detection
- No monthly costs or paid accounts required

## Setup Steps (15 minutes)

### Step 1: Create a New Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Click **Blank** to create a new spreadsheet
3. Name it: **Alex Explores It All - Waitlist**
4. The script will automatically create a "Signups" sheet with headers when first run

### Step 2: Open the Apps Script Editor

1. In your new Google Sheet, click **Extensions** → **Apps Script**
2. A new tab will open with the Apps Script editor
3. You'll see a default `Code.gs` file with some placeholder code

### Step 3: Add the Waitlist Script

1. Delete all the placeholder code in `Code.gs`
2. Open the file `apps-script/Code.gs` from this repository
3. Copy the entire contents
4. Paste it into the Apps Script editor
5. Click the **Save** icon (disk icon) or press Cmd+S / Ctrl+S
6. Name the project: **Waitlist Handler** (when prompted)

### Step 4: Deploy as a Web App

1. In the Apps Script editor, click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ next to "Select type"
3. Choose **Web app**
4. Configure the deployment:
   - **Description:** Waitlist form handler
   - **Execute as:** Me (your-email@gmail.com)
   - **Who has access:** Anyone
5. Click **Deploy**
6. You may see an authorization screen:
   - Click **Authorize access**
   - Choose your Google account
   - If you see a "Google hasn't verified this app" warning:
     - Click **Advanced**
     - Click **Go to Waitlist Handler (unsafe)**
     - Click **Allow**
7. **Copy the Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycby.../exec
   ```

### Step 5: Update index.html

1. Open `index.html` in this repository
2. Find the line with `APPS_SCRIPT_URL_HERE` (around line 125)
3. Replace `APPS_SCRIPT_URL_HERE` with your web app URL from step 4
4. Save the file
5. Commit and push:
   ```bash
   git add index.html
   git commit -m "Configure waitlist backend URL"
   git push
   ```

### Step 6: Test the Form

1. Open your live site at alexexploresitall.com
2. Click "Join the waitlist"
3. Enter a test email (use a real one you control)
4. Click "Notify me"
5. You should see: "You're on the list. Talk soon."
6. Check your Google Sheet — the signup should appear
7. Check alexcentered@gmail.com — you should receive a notification email

## What the Sheet Looks Like

After setup, your Google Sheet will have these columns:

| Timestamp | Email | Status |
|-----------|-------|--------|
| 11/21/2026, 3:15:30 PM | someone@example.com | Pending |
| 11/21/2026, 4:22:18 PM | another@example.com | Pending |

You can:
- Sort by date to see newest first
- Change Status to "Contacted" after reaching out
- Export the data anytime
- Add more columns if needed

## Email Notifications

Each signup triggers an email to alexcentered@gmail.com:

```
Subject: New Waitlist Signup - alexexploresitall.com

New waitlist signup:

Email: someone@example.com
Time: Sat Nov 21 2026 15:15:30 GMT-0800 (PST)

View all signups:
https://docs.google.com/spreadsheets/d/...
```

## Security Features

The form includes:
- **Email validation** — frontend and backend checks
- **Honeypot field** — hidden field to catch bots
- **Duplicate detection** — same email won't be added twice
- **No exposed credentials** — the Apps Script URL is public but secure

## Troubleshooting

### Form submits but nothing appears in the sheet

1. Open your Apps Script project
2. Click **Executions** in the left sidebar
3. Check for errors in recent runs
4. Common issues:
   - Sheet name mismatch (should be "Signups")
   - Authorization not granted
   - CORS issues (the script handles this automatically)

### Not receiving email notifications

1. Check your spam folder
2. Verify `NOTIFICATION_EMAIL` in `Code.gs` is correct
3. Check Apps Script executions for email errors
4. Gmail has sending limits: 100 emails/day for consumer accounts

### "Waitlist service returned an error"

1. Verify the URL in `index.html` matches your deployed web app URL exactly
2. Make sure the deployment is set to "Anyone" for access
3. Check Apps Script executions for the actual error

### Need to update the script

1. Make changes in the Apps Script editor
2. Click **Deploy** → **Manage deployments**
3. Click the pencil icon ✏️ next to your deployment
4. Update the **Version** to "New version"
5. Click **Deploy**
6. The URL stays the same (no need to update `index.html`)

## Privacy & Data

- Signup data is stored in your personal Google Sheet (your Google account)
- Only you can access the sheet and script
- Google Apps Script runs under your account
- No third-party services have access to the data
- To delete data, simply delete rows from the sheet or delete the entire sheet

## Limits

Google Apps Script free tier limits:
- Email quota: 100 emails/day
- Script runtime: 6 minutes per execution (more than enough)
- URL Fetch calls: 20,000/day
- Simultaneous executions: 30

These limits are more than sufficient for a personal waitlist.

## Optional Enhancements

Once it's working, you could:
- Add a "Source" column to track where signups came from
- Set up automatic responses using MailApp
- Create a Google Form as a backup entry method
- Export weekly summaries
- Integrate with your preferred CRM

## Need Help?

If something isn't working:
1. Check the Apps Script execution logs
2. Test with a simple GET request to your web app URL
3. Verify all authorization prompts were accepted
4. Make sure the sheet hasn't been renamed or deleted
