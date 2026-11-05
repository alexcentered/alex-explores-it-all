// Populate the site with content from site.js config
(function() {
  'use strict';
  
  const config = window.SITE_CONFIG;
  
  if (!config) {
    console.error('SITE_CONFIG not found');
    return;
  }
  
  // Hero Section
  function renderHero() {
    document.getElementById('heroTagline').textContent = config.tagline;
    document.getElementById('heroHeadline').textContent = config.hero.headline;
    document.getElementById('heroSupporting').textContent = config.hero.supporting;
    
    const primaryCTA = document.getElementById('primaryCTA');
    primaryCTA.textContent = config.hero.primaryCTA.text;
    primaryCTA.addEventListener('click', () => handleCTAClick(config.hero.primaryCTA.action));
    
    const secondaryCTA = document.getElementById('secondaryCTA');
    secondaryCTA.textContent = config.hero.secondaryCTA.text;
    secondaryCTA.addEventListener('click', () => handleCTAClick(config.hero.secondaryCTA.action));
  }
  
  function handleCTAClick(action) {
    if (action.startsWith('scrollTo')) {
      const sectionId = action.replace('scrollTo', '').toLowerCase();
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.location.href = action;
    }
  }
  
  // Services Section
  function renderServices() {
    const grid = document.getElementById('serviceGrid');
    grid.innerHTML = config.services.map(service => `
      <div class="service-card">
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.description)}</p>
      </div>
    `).join('');
  }
  
  // Principles Section
  function renderPrinciples() {
    const list = document.getElementById('principlesList');
    list.innerHTML = config.principles.map(principle => `
      <li>${escapeHtml(principle)}</li>
    `).join('');
  }
  
  // Outcomes Section
  function renderOutcomes() {
    const list = document.getElementById('outcomesList');
    list.innerHTML = config.outcomes.map(outcome => `
      <li>${escapeHtml(outcome)}</li>
    `).join('');
  }
  
  // Background Section
  function renderBackground() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = config.background.map(item => `
      <div class="timeline-item">
        <div class="timeline-years">${escapeHtml(item.years)}</div>
        <div class="timeline-content">
          <div class="timeline-company">${escapeHtml(item.company)}</div>
          <div class="timeline-title">${escapeHtml(item.title)}</div>
          ${item.description ? `<div class="timeline-description">${escapeHtml(item.description)}</div>` : ''}
        </div>
      </div>
    `).join('');
    
    const skillsChips = document.getElementById('skillsChips');
    skillsChips.innerHTML = config.skills.map(skill => `
      <span class="skill-chip">${escapeHtml(skill)}</span>
    `).join('');
  }
  
  // Booking Section
  function renderBooking() {
    const container = document.getElementById('bookingOptions');
    container.innerHTML = config.bookingOptions.map(option => {
      const link = config.bookingLinks[option.linkKey];
      
      if (link) {
        // If link exists, show a button
        return `
          <div class="booking-card">
            <h3>${escapeHtml(option.title)}</h3>
            <p>${escapeHtml(option.description)}</p>
            <a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn btn-primary">Book now</a>
          </div>
        `;
      } else {
        // If no link, show fallback
        return `
          <div class="booking-card">
            <h3>${escapeHtml(option.title)}</h3>
            <p>${escapeHtml(option.description)}</p>
            <div class="booking-fallback">
              <p class="fallback-message">Booking opens soon</p>
              <a href="mailto:${config.email}?subject=Interested in ${option.title}" class="btn btn-secondary">Email me</a>
            </div>
          </div>
        `;
      }
    }).join('');
  }
  
  // Footer
  function renderFooter() {
    document.getElementById('footerText').textContent = `${config.name} © ${config.footer.year}`;
  }
  
  // Utility: escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Initialize
  function init() {
    renderHero();
    renderServices();
    renderPrinciples();
    renderOutcomes();
    renderBackground();
    renderBooking();
    renderFooter();
  }
  
  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
