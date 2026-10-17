/* Language Bridge DigitalPulse promotional rail, 2026-10-17.
   No external dependencies, analytics, tracking, or writes to local storage.
   Watches only the app root because the main app redraws its whole layout. */
(() => {
  'use strict';
  const root = document.getElementById('app');
  if (!root || !('MutationObserver' in window)) return;

  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function promote() {
    const shell = root.querySelector('.app-shell');
    if (!shell || shell.querySelector('.dp-showcase')) return;
    const footer = shell.querySelector(':scope > footer');
    if (!footer) return;
    const lv = document.documentElement.lang.toLowerCase().startsWith('lv');
    const copy = lv ? {
      region: 'Izstrādātājs DigitalPulse un citas lietotnes',
      eyebrow: 'MĀJASLAPAS · LIETOTNES · E-VEIKALI',
      headline: 'Tava ideja. Mūsu izstrāde.',
      description: 'Mūsdienīgas, ātras mājaslapas un lietotnes, WordPress, WooCommerce un individuāli digitālie risinājumi.',
      cta: 'Apskatīt pakalpojumus',
      other: 'Citas mūsu lietotnes',
      intro: 'Atklāj vairāk noderīgu rīku',
      attribution: 'Izstrādāja'
    } : {
      region: 'DigitalPulse app developer and other apps',
      eyebrow: 'WEBSITES · APPS · E-COMMERCE',
      headline: 'Your idea. Expertly built.',
      description: 'Modern, fast websites and apps, WordPress, WooCommerce and custom digital solutions.',
      cta: 'Explore our services',
      other: 'Our other apps',
      intro: 'Discover more useful tools',
      attribution: 'Developed by'
    };

    const apps = [
      ['https://translate.63.lv/', '🌐', lv ? 'Tulkotājs' : 'Translate', 'translate.63.lv'],
      ['https://games.63.lv/', '🎮', lv ? 'Spēles' : 'Games', 'games.63.lv'],
      ['https://whiteboard.63.lv/', '✏️', lv ? 'Tāfele' : 'Whiteboard', 'whiteboard.63.lv'],
      ['https://price.63.lv/', '📊', lv ? 'Cenu salīdzināšana' : 'Price Compare', 'price.63.lv'],
      ['https://radio.63.lv/', '📻', 'Radio', 'radio.63.lv']
    ];
    const links = apps.map(([url, icon, label, domain]) =>
      `<a class="dp-app-link" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)} — ${domain}">` +
        `<span class="dp-app-icon" aria-hidden="true">${icon}</span>` +
        `<span class="dp-app-copy"><strong>${esc(label)}</strong><small>${domain}</small></span>` +
        '<span class="dp-app-arrow" aria-hidden="true">↗</span>' +
      '</a>'
    ).join('');

    const aside = document.createElement('aside');
    aside.className = 'dp-showcase';
    aside.setAttribute('aria-label', copy.region);
    aside.innerHTML = `
      <section class="dp-developer">
        <div class="dp-brand"><span class="dp-brand-mark" aria-hidden="true">⌁</span><span>digital<b>pulse</b><small>.click</small></span></div>
        <div class="dp-kicker">${esc(copy.eyebrow)}</div>
        <h2>${esc(copy.headline)}</h2>
        <p>${esc(copy.description)}</p>
        <a class="dp-cta" href="https://digitalpulse.click/" target="_blank" rel="noopener noreferrer">
          <span>${esc(copy.cta)}</span><span aria-hidden="true">↗</span>
        </a>
      </section>
      <nav class="dp-apps" aria-label="${esc(copy.other)}">
        <div class="dp-apps-heading"><strong>${esc(copy.other)}</strong><small>${esc(copy.intro)}</small></div>
        <div class="dp-app-grid">${links}</div>
      </nav>`;
    footer.before(aside);

    const credit = footer.querySelector('.footer-inner > span:last-child');
    if (credit) {
      credit.classList.add('dp-footer-credit');
      credit.replaceChildren(
        document.createTextNode('Language Bridge v0.7.2 · ' + copy.attribution + ' ')
      );
      const link = document.createElement('a');
      link.href = 'https://digitalpulse.click/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'DigitalPulse.click ↗';
      credit.append(link);
    }
  }

  // childList on #app only: rendering the aside inside .app-shell cannot loop.
  const observer = new MutationObserver(promote);
  observer.observe(root, {childList: true});
  promote();
})();
