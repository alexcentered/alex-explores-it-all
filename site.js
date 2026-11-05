// EDITABLE CONTENT
// Update this file to change copy, services, booking links, and contact info

const SITE_CONFIG = {
  // Personal Info
  name: "Alex Arnwine",
  tagline: "Quality systems builder",
  email: "alexcentered@gmail.com",
  linkedIn: "https://www.linkedin.com/in/alex-arnwine-78a5338a",
  
  // Hero Section
  hero: {
    headline: "I build the quality systems that let teams ship with confidence",
    supporting: "17 years in QA across finance, enterprise software, streaming, and AI. When the tools don't exist, I build them.",
    primaryCTA: {
      text: "Book a call",
      action: "scrollToBooking" // or provide a URL
    },
    secondaryCTA: {
      text: "View background",
      action: "scrollToBackground"
    }
  },
  
  // Services
  services: [
    {
      title: "QA & Quality Engineering",
      description: "Test strategy, release readiness, API and SQL validation, regression planning, and UAT coordination."
    },
    {
      title: "AI Product Quality",
      description: "Evaluation and review workflows, sampling and vendor audits, ground-truth management, confidence-based routing between automation and human review."
    },
    {
      title: "Custom QA & Internal Tools",
      description: "Keyboard-driven review consoles, offline HTML review tools, and daily monitoring pipelines with Python, Playwright, and Google Sheets."
    },
    {
      title: "Technical Delivery",
      description: "Scrum facilitation, requirements gathering, launch coordination, and offshore team coordination."
    },
    {
      title: "Sites & Portals",
      description: "Static sites with forms and Google Sheets/Apps Script backends for operators, families, and nonprofits."
    }
  ],
  
  // How I Work (Principles)
  principles: [
    "Worst-case-first review",
    "Ground truth is sacred",
    "Deterministic checks before AI",
    "Gate downstream work on upstream health",
    "Never overwrite a prior run",
    "Report for the reader"
  ],
  
  // Selected Outcomes (anonymized facts only)
  outcomes: [
    "Reviewed AI-generated image batches of 3,000 to 50,000 images",
    "Built computer-vision QC that processed 8,500+ paired images at ~38 images per second (under 4 minutes for the full set), auto-resolving ~62% of issues",
    "Analyzed 2,800+ failure log entries over 30 days to identify the dominant failure cause and deliver a ranked fix list to engineering",
    "Built a daily pipeline tracking up to 200 new products per day across three systems",
    "Designed a stratified audit program for an offshore annotation vendor",
    "Built a keyboard-driven review console that replaced a slow stock UI"
  ],
  
  // Background Timeline
  background: [
    {
      years: "2023–2026",
      company: "Zelig",
      title: "QA Manager",
      description: "Quality and project delivery for AI virtual try-on"
    },
    {
      years: "2022–2023",
      company: "Oliver Wight Americas",
      title: "PM, Scrum Master, QA Engineer",
      description: null
    },
    {
      years: "2019–2022",
      company: "FilmTrack (City National Bank)",
      title: "QA Lead",
      description: null
    },
    {
      years: "2016–2019",
      company: "VTP",
      title: "QA Engineer, PM, Technical Lead",
      description: null
    },
    {
      years: "2014–2016",
      company: "AZUBU",
      title: "QA Engineer & Systems Admin",
      description: null
    },
    {
      years: "2013–2014",
      company: "imATHLETE",
      title: "QA Lead to Manager",
      description: null
    },
    {
      years: "2012–2013",
      company: "Becker",
      title: "QA Analyst",
      description: null
    },
    {
      years: "2009–2012",
      company: "Contract work",
      title: "Dev, QA, PM",
      description: "Entertainment clients"
    },
    {
      years: "2007–2009",
      company: "Intuit",
      title: "Tier II Support & QA",
      description: null
    }
  ],
  
  // Skills
  skills: [
    "Test Strategy",
    "API Testing (Postman)",
    "SQL",
    "Python",
    "OpenCV",
    "Playwright",
    "Selenium",
    "Cypress",
    "JavaScript/TypeScript",
    "React",
    "SQLite",
    "Google Sheets/Apps Script",
    "Jira",
    "Zephyr",
    "TestRail",
    "Agile/Scrum",
    "AI-assisted building (Claude, Cursor, ChatGPT)"
  ],
  
  // Booking Links
  // Add your Google Calendar appointment schedule URLs here
  // When empty, the site shows a fallback "Booking opens soon" message
  bookingLinks: {
    discovery: "https://calendar.app.google/XYhK1UtA7DofFz75A", // 30-minute discovery call URL
    session: "https://calendar.app.google/eaosP9g8TJVQykZ36"    // 60-minute working session URL
  },
  
  // Booking Options
  bookingOptions: [
    {
      title: "30-minute discovery call",
      description: "Discuss your quality challenges and explore how I can help",
      linkKey: "discovery"
    },
    {
      title: "60-minute working session",
      description: "Dive into a specific problem and start making progress",
      linkKey: "session"
    }
  ],
  
  // Footer
  footer: {
    year: new Date().getFullYear()
  }
};

// Make config available globally
window.SITE_CONFIG = SITE_CONFIG;
