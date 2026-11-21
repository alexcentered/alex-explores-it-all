# Waitlist Backend - Google Apps Script

This directory contains the backend code for the waitlist form on alexexploresitall.com.

## Files

- **Code.gs** - The Google Apps Script that handles form submissions

## How It Works

1. Form submissions are sent to a Google Apps Script web app
2. The script appends emails to a Google Sheet
3. Email notifications are sent to alexcentered@gmail.com
4. Duplicates are automatically detected and prevented

## Deployment

This code needs to be deployed from your Google account. See the main **[WAITLIST_SETUP.md](../WAITLIST_SETUP.md)** in the repository root for complete setup instructions.

## Quick Deploy

1. Create a new Google Sheet
2. Open Extensions → Apps Script
3. Copy the contents of `Code.gs` into the editor
4. Deploy as a Web App (Anyone can access)
5. Copy the deployment URL into `index.html`

That's it. No servers, no paid services, no complex configuration.
