# Alex Arnwine — Personal Site

Static personal site for [alexexploresitall.com](https://alexexploresitall.com), hosted via GitHub Pages.

## Quick Links

- **Live site**: https://alexexploresitall.com (once DNS is configured and GitHub Pages is enabled)
- **Edit content**: [`site.js`](site.js)

---

## Editing Content

All site content (copy, services, booking links, contact info) is centralized in **`site.js`**. Edit that file to update the site—no HTML or CSS knowledge needed for most changes.

### Key sections you can edit:

1. **Personal Info** (name, email, LinkedIn)
2. **Hero** (headline, supporting text, CTA buttons)
3. **Services** (what you offer)
4. **Principles** (how you work)
5. **Outcomes** (selected accomplishments)
6. **Background** (work history timeline)
7. **Skills** (technology/method chips)
8. **Booking Links** (see below)
9. **Footer** (year updates automatically)

### Adding Booking Links

The site supports Google Calendar appointment schedule pages. To enable booking:

1. Create your appointment schedules in Google Calendar:
   - 30-minute discovery call
   - 60-minute working session

2. Copy the shareable booking URLs from Google Calendar

3. Edit `site.js` and paste the URLs into the `bookingLinks` object:

```javascript
bookingLinks: {
  discovery: 'https://calendar.google.com/calendar/appointments/schedules/YOUR_DISCOVERY_LINK',
  session: 'https://calendar.google.com/calendar/appointments/schedules/YOUR_SESSION_LINK'
}
```

4. Commit and push to update the live site

**When booking links are empty**, the site automatically shows a "Booking opens soon, email me" fallback with a mailto link.

---

## GitHub Pages Setup

This site is configured to deploy from the `main` branch root directory.

### First-time setup:

1. Go to your repository **Settings** → **Pages**
2. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click **Save**

GitHub Pages will build and deploy the site automatically. The first deployment takes a few minutes.

### Custom Domain (alexexploresitall.com):

Once you're ready to connect the domain:

1. In your domain registrar (where you purchased alexexploresitall.com), add these DNS records:

   ```
   Type    Name    Value
   A       @       185.199.108.153
   A       @       185.199.109.153
   A       @       185.199.110.153
   A       @       185.199.111.153
   CNAME   www     YOUR_GITHUB_USERNAME.github.io
   ```

2. Back in GitHub **Settings** → **Pages**, under **Custom domain**:
   - Enter: `alexexploresitall.com`
   - Click **Save**
   - Check **Enforce HTTPS** (after DNS propagates)

DNS changes can take 24-48 hours to fully propagate.

---

## File Structure

```
/
├── index.html       # Main HTML structure
├── styles.css       # All styles (dark theme, no blue)
├── site.js          # Editable content config ← EDIT THIS
├── app.js           # Populates HTML from site.js
├── favicon.svg      # Site icon (gray monogram)
├── .nojekyll        # Tells GitHub Pages to serve files as-is
└── README.md        # This file
```

---

## Design Notes

- **Dark theme**: Near-black backgrounds, warm/neutral grays, off-white text
- **No blue**: Warm neutral accents only (per your design requirements)
- **Responsive**: Works on mobile, tablet, and desktop
- **Accessible**: Semantic HTML, keyboard navigation, screen-reader friendly
- **Fast**: No build step, no frameworks, plain HTML/CSS/JS

---

## Local Development

To preview changes locally:

1. Open `index.html` directly in a browser, or
2. Run a local server:
   ```bash
   python3 -m http.server 8000
   # or
   npx serve
   ```
3. Visit `http://localhost:8000`

---

## Questions?

**Email**: alexcentered@gmail.com  
**LinkedIn**: https://www.linkedin.com/in/alex-arnwine-78a5338a
