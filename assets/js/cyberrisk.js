/* ════════════════════════════════
   DATASET TECNOLOGÍAS
════════════════════════════════ */

const TECHS = [

  { id: 'apache', name: 'Apache HTTP Server', vendor: 'Apache', cat: 'Servidores Web' },
  { id: 'nginx', name: 'Nginx', vendor: 'Nginx Inc.', cat: 'Servidores Web' },
  { id: 'iis', name: 'IIS', vendor: 'Microsoft', cat: 'Servidores Web' },

  { id: 'mysql', name: 'MySQL', vendor: 'Oracle', cat: 'Bases de Datos' },
  { id: 'postgresql', name: 'PostgreSQL', vendor: 'PostgreSQL Global', cat: 'Bases de Datos' },
  { id: 'mssql', name: 'SQL Server', vendor: 'Microsoft', cat: 'Bases de Datos' },
  { id: 'mongodb', name: 'MongoDB', vendor: 'MongoDB Inc.', cat: 'Bases de Datos' },

  { id: 'wordpress', name: 'WordPress', vendor: 'Automattic', cat: 'CMS / Frameworks' },
  { id: 'laravel', name: 'Laravel', vendor: 'Taylor Otwell', cat: 'CMS / Frameworks' },
  { id: 'django', name: 'Django', vendor: 'Django Software', cat: 'CMS / Frameworks' },
  { id: 'node', name: 'Node.js', vendor: 'OpenJS Foundation', cat: 'CMS / Frameworks' },

  { id: 'win-server', name: 'Windows Server', vendor: 'Microsoft', cat: 'Sistemas Operativos' },
  { id: 'ubuntu', name: 'Ubuntu Server', vendor: 'Canonical', cat: 'Sistemas Operativos' },
  { id: 'centos', name: 'CentOS', vendor: 'Red Hat', cat: 'Sistemas Operativos' },

  { id: 'openssl', name: 'OpenSSL', vendor: 'OpenSSL Project', cat: 'Librerías / Seguridad' },
  { id: 'log4j', name: 'Log4j', vendor: 'Apache', cat: 'Librerías / Seguridad' },
  { id: 'spring', name: 'Spring Boot', vendor: 'VMware', cat: 'Librerías / Seguridad' },

];


/* ════════════════════════════════
   PROVEEDORES
════════════════════════════════ */

const PROVIDERS = [

  {
    id: 'microsoft',
    name: 'Microsoft',
    country: 'USA',
    risk: 'high'
  },

  {
    id: 'google',
    name: 'Google Cloud',
    country: 'USA',
    risk: 'medium'
  },

  {
    id: 'amazon',
    name: 'Amazon AWS',
    country: 'USA',
    risk: 'high'
  },

  {
    id: 'oracle',
    name: 'Oracle',
    country: 'USA',
    risk: 'high'
  },

  {
    id: 'apache',
    name: 'Apache Foundation',
    country: 'USA',
    risk: 'medium'
  },

  {
    id: 'vmware',
    name: 'VMware',
    country: 'USA',
    risk: 'critical'
  },

  {
    id: 'fortinet',
    name: 'Fortinet',
    country: 'USA',
    risk: 'critical'
  },

  {
    id: 'paloalto',
    name: 'Palo Alto Networks',
    country: 'USA',
    risk: 'medium'
  },

  {
    id: 'canonical',
    name: 'Canonical',
    country: 'UK',
    risk: 'low'
  },

  {
    id: 'redhat',
    name: 'Red Hat',
    country: 'USA',
    risk: 'medium'
  }

];


/* ════════════════════════════════
   CWE DATA
════════════════════════════════ */

const CWE_DATA = {

  apache: [
    {
      id: 'CWE-20',
      sev: 'critical',
      name: 'Validación de entrada incorrecta',
      desc: 'Path traversal en módulos mod_rewrite.',
      cves: 47
    },

    {
      id: 'CWE-400',
      sev: 'high',
      name: 'Consumo no controlado de recursos',
      desc: 'Ataques DoS HTTP/2.',
      cves: 18
    }
  ],

  nginx: [
    {
      id: 'CWE-444',
      sev: 'high',
      name: 'HTTP Request Smuggling',
      desc: 'Inyección por parsing inconsistente.',
      cves: 12
    }
  ],

  mysql: [
    {
      id: 'CWE-89',
      sev: 'critical',
      name: 'SQL Injection',
      desc: 'Parámetros no sanitizados.',
      cves: 63
    }
  ],

  wordpress: [
    {
      id: 'CWE-79',
      sev: 'high',
      name: 'Cross-Site Scripting',
      desc: 'Plugins vulnerables.',
      cves: 89
    }
  ],

  openssl: [
    {
      id: 'CWE-125',
      sev: 'critical',
      name: 'Out-of-bounds Read',
      desc: 'Heartbleed y variantes.',
      cves: 58
    }
  ]

};


/* ════════════════════════════════
   RECOMENDACIONES
════════════════════════════════ */

const RECS = {

  critical: [

    'Aplicar parches de seguridad de forma inmediata.',

    'Aislar servicios críticos en segmentos de red.',

    'Activar WAF con reglas actualizadas.',

    'Revisar logs de explotación recientes.'

  ],

  high: [

    'Programar mantenimiento de parcheo.',

    'Implementar mínimo privilegio.',

    'Activar MFA en accesos administrativos.'

  ],

  medium: [

    'Revisar configuraciones por defecto.',

    'Ejecutar escaneo mensual.',

    'Actualizar dependencias.'

  ]

};


/* ════════════════════════════════
   ESTADO GLOBAL
════════════════════════════════ */

let currentView = 'tech';

let selected = new Set();

let selectedProviders = new Set();

let filteredTechs = TECHS;

let filteredProviders = PROVIDERS;


/* ════════════════════════════════
   SWITCH TABS
════════════════════════════════ */

function switchTab(view) {

  currentView = view;

  document
    .querySelectorAll('.cr-tab')
    .forEach(tab => tab.classList.remove('active'));

  if (view === 'tech') {

    document
      .getElementById('tab-tech')
      .classList.add('active');

    renderTechs(filteredTechs);

  } else {

    document
      .getElementById('tab-provider')
      .classList.add('active');

    renderProviders(filteredProviders);

  }

}


/* ════════════════════════════════
   SEARCH
════════════════════════════════ */

function handleSearch(q) {

  if (currentView === 'tech') {

    filterTechs(q);

  } else {

    filterProviders(q);

  }

}


/* ════════════════════════════════
   FILTER TECHS
════════════════════════════════ */

function filterTechs(q) {

  filteredTechs = q

    ? TECHS.filter(t =>

      t.name.toLowerCase().includes(q.toLowerCase()) ||

      t.vendor.toLowerCase().includes(q.toLowerCase())

    )

    : TECHS;

  renderTechs(filteredTechs);

}


/* ════════════════════════════════
   FILTER PROVIDERS
════════════════════════════════ */

function filterProviders(q) {

  filteredProviders = q

    ? PROVIDERS.filter(provider =>

      provider.name
        .toLowerCase()
        .includes(q.toLowerCase())

    )

    : PROVIDERS;

  renderProviders(filteredProviders);

}


/* ════════════════════════════════
   RENDER TECHS
════════════════════════════════ */

function renderTechs(list) {

  const cats = {};

  list.forEach(t => {

    if (!cats[t.cat]) {

      cats[t.cat] = [];

    }

    cats[t.cat].push(t);

  });

  let html = '';

  for (const [cat, items] of Object.entries(cats)) {

    html += `
      <div class="cr-cat-label">
        ${cat}
      </div>

      <div class="cr-tech-list">
    `;

    items.forEach(t => {

      const sel =
        selected.has(t.id)
          ? 'selected'
          : '';

      html += `
        <button
          class="cr-tech-item ${sel}"
          onclick="toggleTech('${t.id}')"
        >

          <div class="cr-tech-check">
            ${selected.has(t.id) ? '✓' : ''}
          </div>

          <span class="cr-tech-name">
            ${t.name}
          </span>

          <span class="cr-tech-vendor">
            ${t.vendor}
          </span>

        </button>
      `;

    });

    html += `</div>`;

  }

  document.getElementById(
    'cr-selector-container'
  ).innerHTML = html;

}


/* ════════════════════════════════
   RENDER PROVIDERS
════════════════════════════════ */

function renderProviders(list) {

  let html = '';

  list.forEach(provider => {

    const sel =
      selectedProviders.has(provider.id)
        ? 'selected'
        : '';

    html += `
      <button
        class="cr-tech-item ${sel}"
        onclick="toggleProvider('${provider.id}')"
      >

        <div class="cr-tech-check">
          ${selectedProviders.has(provider.id) ? '✓' : ''}
        </div>

        <span class="cr-tech-name">
          ${provider.name}
        </span>

        <span class="cr-tech-vendor">
          ${provider.country}
        </span>

      </button>
    `;

  });

  document.getElementById(
    'cr-selector-container'
  ).innerHTML = html;

}


/* ════════════════════════════════
   SELECT TECH
════════════════════════════════ */

function toggleTech(id) {

  if (selected.has(id)) {

    selected.delete(id);

  } else {

    selected.add(id);

  }

  updateSummary();

  renderTechs(filteredTechs);

}


/* ════════════════════════════════
   SELECT PROVIDER
════════════════════════════════ */

function toggleProvider(id) {

  if (selectedProviders.has(id)) {

    selectedProviders.delete(id);

  } else {

    selectedProviders.add(id);

  }

  updateSummary();

  renderProviders(filteredProviders);

}


/* ════════════════════════════════
   UPDATE SUMMARY
════════════════════════════════ */

function updateSummary() {

  const techCount =
    selected.size;

  const providerCount =
    selectedProviders.size;

  document.getElementById(
    'cr-sel-count'
  ).textContent =
    `${techCount} tecnologías`;

  document.getElementById(
    'cr-provider-count'
  ).textContent =
    `${providerCount} proveedores`;

  document.getElementById(
    'cr-analyze-btn'
  ).disabled =
    techCount === 0 &&
    providerCount === 0;

}


/* ════════════════════════════════
   RUN ANALYSIS
════════════════════════════════ */

function runAnalysis() {

  const allCwes = [];

  selected.forEach(id => {

    (CWE_DATA[id] || [])
      .forEach(cwe => {

        allCwes.push({
          ...cwe,
          tech: id
        });

      });

  });

  const deduped = [];

  const seen = new Set();

  allCwes.forEach(cwe => {

    if (!seen.has(cwe.id)) {

      seen.add(cwe.id);

      deduped.push(cwe);

    }

  });

  const critical =
    deduped.filter(c => c.sev === 'critical');

  const high =
    deduped.filter(c => c.sev === 'high');

  const medium =
    deduped.filter(c => c.sev === 'medium');

  const totalCves =
    deduped.reduce((s, c) => s + c.cves, 0);


  /* RIESGO PROVEEDORES */

  let providerRisk = 0;

  selectedProviders.forEach(id => {

    const provider =
      PROVIDERS.find(p => p.id === id);

    if (!provider) return;

    if (provider.risk === 'critical') {

      providerRisk += 20;

    } else if (provider.risk === 'high') {

      providerRisk += 12;

    } else if (provider.risk === 'medium') {

      providerRisk += 6;

    } else {

      providerRisk += 2;

    }

  });


  /* SCORE */

  const baseScore =

    critical.length * 25 +

    high.length * 12 +

    medium.length * 5;

  const score =
    Math.min(
      100,
      baseScore + providerRisk
    );


  /* HEADER */

  const selectedNames = [

    ...Array.from(selected)
      .map(id => TECHS.find(t => t.id === id)?.name),

    ...Array.from(selectedProviders)
      .map(id => PROVIDERS.find(p => p.id === id)?.name)

  ];

  document.getElementById(
    'cr-result-sub'
  ).textContent =
    '// ' + selectedNames.join(' · ');

  document.getElementById(
    'cr-result-date'
  ).textContent =
    new Date()
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ') + ' UTC';


  /* SCORE */

  document.getElementById(
    'cr-exp-score'
  ).textContent =
    `${score}/100`;

  document.getElementById(
    'cr-exp-score'
  ).style.color =

    score >= 70
      ? '#e84040'

      : score >= 40
        ? '#f0a500'
        : '#2ecc71';


  /* CARDS */

  document.getElementById(
    'sc-critical'
  ).textContent =
    critical.length;

  document.getElementById(
    'sc-high'
  ).textContent =
    high.length;

  document.getElementById(
    'sc-medium'
  ).textContent =
    medium.length;

  document.getElementById(
    'sc-cves'
  ).textContent =
    totalCves;


  /* BAR */

  setTimeout(() => {

    document.getElementById(
      'cr-bar-fill'
    ).style.width =
      score + '%';

  }, 100);


  /* CWE */

  const cweHtml =

    [...critical, ...high, ...medium]

      .map(cwe => `

      <div class="cr-cwe-item sev-${cwe.sev}">

        <div class="cr-cwe-top">

          <span class="cr-cwe-id">
            ${cwe.id}
          </span>

          <span class="cr-cwe-name">
            ${cwe.name}
          </span>

          <span class="cr-sev-badge ${cwe.sev}">
            ${cwe.sev.toUpperCase()}
          </span>

        </div>

        <div class="cr-cwe-meta">

          <span class="cr-cwe-desc">
            ${cwe.desc}
          </span>

          <span class="cr-affected">
            ${cwe.cves} CVEs
          </span>

        </div>

      </div>

    `).join('');


  document.getElementById(
    'cr-cwe-list'
  ).innerHTML =

    cweHtml ||

    `
      <div
        style="
          color:#2e4a60;
          font-size:.8rem;
        "
      >
        No se encontraron vulnerabilidades.
      </div>
    `;


  /* RECOMENDACIONES */

  const recSrc =

    critical.length
      ? RECS.critical

      : high.length
        ? RECS.high
        : RECS.medium;


  document.getElementById(
    'cr-rec-list'
  ).innerHTML =

    recSrc.map((rec, i) => `

      <div class="cr-rec-item">

        <span class="cr-rec-num">
          R${String(i + 1).padStart(2, '0')}
        </span>

        <span class="cr-rec-text">
          ${rec}
        </span>

      </div>

    `).join('');


  /* SHOW RESULT */

  document.getElementById(
    'cr-empty'
  ).style.display =
    'none';

  document.getElementById(
    'cr-result'
  ).classList.add('visible');

  document.querySelector(
    '.cr-right'
  ).scrollTop = 0;

}


/* ════════════════════════════════
   INIT
════════════════════════════════ */

renderTechs(TECHS);

updateSummary();