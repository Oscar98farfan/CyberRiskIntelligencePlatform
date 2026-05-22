const TECHS = [
  { id:'apache', name:'Apache HTTP Server', vendor:'Apache', cat:'Servidores Web' },
  { id:'nginx', name:'Nginx', vendor:'Nginx Inc.', cat:'Servidores Web' },
  { id:'iis', name:'IIS', vendor:'Microsoft', cat:'Servidores Web' },
  { id:'mysql', name:'MySQL', vendor:'Oracle', cat:'Bases de Datos' },
  { id:'postgresql', name:'PostgreSQL', vendor:'PostgreSQL Global', cat:'Bases de Datos' },
  { id:'mssql', name:'SQL Server', vendor:'Microsoft', cat:'Bases de Datos' },
  { id:'mongodb', name:'MongoDB', vendor:'MongoDB Inc.', cat:'Bases de Datos' },
  { id:'wordpress', name:'WordPress', vendor:'Automattic', cat:'CMS / Frameworks' },
  { id:'laravel', name:'Laravel', vendor:'Taylor Otwell', cat:'CMS / Frameworks' },
  { id:'django', name:'Django', vendor:'Django Software', cat:'CMS / Frameworks' },
  { id:'node', name:'Node.js', vendor:'OpenJS Foundation', cat:'CMS / Frameworks' },
  { id:'win-server', name:'Windows Server', vendor:'Microsoft', cat:'Sistemas Operativos' },
  { id:'ubuntu', name:'Ubuntu Server', vendor:'Canonical', cat:'Sistemas Operativos' },
  { id:'centos', name:'CentOS', vendor:'Red Hat', cat:'Sistemas Operativos' },
  { id:'openssl', name:'OpenSSL', vendor:'OpenSSL Project', cat:'Librerías / Seguridad' },
  { id:'log4j', name:'Log4j', vendor:'Apache', cat:'Librerías / Seguridad' },
  { id:'spring', name:'Spring Boot', vendor:'VMware', cat:'Librerías / Seguridad' },
];

const CWE_DATA = {
  apache:     [{ id:'CWE-20',  sev:'critical', name:'Validación de entrada incorrecta', desc:'Path traversal en módulos mod_rewrite sin sanitización.', cves:47 },
               { id:'CWE-400', sev:'high',     name:'Consumo no controlado de recursos', desc:'Ataques DoS por requests malformados HTTP/2.', cves:18 }],
  nginx:      [{ id:'CWE-444', sev:'high',     name:'HTTP Request Smuggling', desc:'Inconsistencias en parsing de headers permiten inyección.', cves:12 }],
  iis:        [{ id:'CWE-22',  sev:'critical', name:'Path Traversal', desc:'Acceso a archivos fuera del webroot mediante encoding Unicode.', cves:29 },
               { id:'CWE-287', sev:'high',     name:'Autenticación inapropiada', desc:'Bypass de autenticación NTLM en entornos de dominio.', cves:15 }],
  mysql:      [{ id:'CWE-89',  sev:'critical', name:'SQL Injection', desc:'Parámetros no sanitizados en procedimientos almacenados.', cves:63 }],
  postgresql: [{ id:'CWE-732', sev:'medium',   name:'Permisos incorrectos en recursos', desc:'Roles de BD con privilegios excesivos por defecto.', cves:9 }],
  mssql:      [{ id:'CWE-89',  sev:'critical', name:'SQL Injection', desc:'Inyección en linked servers y funciones xp_cmdshell activas.', cves:41 },
               { id:'CWE-269', sev:'high',     name:'Gestión inapropiada de privilegios', desc:'SA account activa con password débil en instalaciones default.', cves:22 }],
  mongodb:    [{ id:'CWE-284', sev:'high',     name:'Control de acceso inapropiado', desc:'Instancias sin autenticación expuestas en red pública.', cves:31 }],
  wordpress:  [{ id:'CWE-79',  sev:'high',     name:'Cross-Site Scripting (XSS)', desc:'Plugins desactualizados con salida HTML sin escapar.', cves:89 },
               { id:'CWE-862', sev:'critical', name:'Autorización faltante', desc:'Escalación de privilegios via REST API sin capability check.', cves:54 }],
  laravel:    [{ id:'CWE-502', sev:'critical', name:'Deserialización de datos no confiables', desc:'Gadget chains en unserialize() permiten RCE.', cves:16 }],
  django:     [{ id:'CWE-352', sev:'medium',   name:'Cross-Site Request Forgery', desc:'CSRF token ausente en formularios con decoradores incorrectos.', cves:7 }],
  node:       [{ id:'CWE-1321',sev:'high',     name:'Prototype Pollution', desc:'Modificación del prototipo Object en dependencias npm.', cves:38 }],
  'win-server':[{ id:'CWE-416',sev:'critical', name:'Use After Free', desc:'Vulnerabilidades en RPC/RDP — MS-RDP BlueKeep y variantes.', cves:72 },
                { id:'CWE-287',sev:'high',     name:'Autenticación inapropiada', desc:'Pass-the-hash en entornos sin Credential Guard.', cves:33 }],
  ubuntu:     [{ id:'CWE-269', sev:'medium',   name:'Gestión inapropiada de privilegios', desc:'sudo misconfigurations en entornos multi-usuario.', cves:14 }],
  centos:     [{ id:'CWE-119', sev:'high',     name:'Buffer Overflow', desc:'CentOS 7 en EOL — sin parches de seguridad activos.', cves:45 }],
  openssl:    [{ id:'CWE-125', sev:'critical', name:'Out-of-bounds Read', desc:'Heartbleed y variantes en versiones < 3.x sin patch.', cves:58 }],
  log4j:      [{ id:'CWE-917', sev:'critical', name:'Inyección de expresión de lenguaje', desc:'Log4Shell: JNDI lookup permite RCE remoto sin autenticación.', cves:6 }],
  spring:     [{ id:'CWE-94',  sev:'critical', name:'Inyección de código', desc:'Spring4Shell: ClassLoader manipulation via DataBinder.', cves:11 }],
};

const RECS = {
  critical: [
    'Aplicar parches de seguridad de forma inmediata — prioridad P0.',
    'Aislar los servicios afectados en segmentos de red restringidos (DMZ).',
    'Activar WAF con reglas actualizadas para vectores CWE detectados.',
    'Revisar logs de acceso de los últimos 30 días en busca de explotación.',
  ],
  high: [
    'Programar ventana de mantenimiento en los próximos 7 días para parcheo.',
    'Implementar principio de mínimo privilegio en todos los servicios afectados.',
    'Habilitar autenticación multifactor en interfaces administrativas.',
  ],
  medium: [
    'Incluir en el siguiente ciclo de hardening del sistema.',
    'Revisar configuraciones por defecto y deshabilitar servicios innecesarios.',
    'Ejecutar escaneo de vulnerabilidades mensual con herramientas OSINT.',
  ],
};

let selected = new Set();
let filtered = TECHS;

function renderTechs(list) {
  const cats = {};
  list.forEach(t => { if(!cats[t.cat]) cats[t.cat]=[]; cats[t.cat].push(t); });
  let html = '';
  for(const [cat, items] of Object.entries(cats)) {
    html += `<div class="cr-cat-label">${cat}</div><div class="cr-tech-list">`;
    items.forEach(t => {
      const sel = selected.has(t.id) ? 'selected' : '';
      html += `<button class="cr-tech-item ${sel}" onclick="toggleTech('${t.id}')">
        <div class="cr-tech-check">${selected.has(t.id)? '✓':''}</div>
        <span class="cr-tech-name">${t.name}</span>
        <span class="cr-tech-vendor">${t.vendor}</span>
      </button>`;
    });
    html += '</div>';
  }
  document.getElementById('cr-tech-container').innerHTML = html;
}

function filterTechs(q) {
  filtered = q ? TECHS.filter(t => t.name.toLowerCase().includes(q.toLowerCase()) || t.vendor.toLowerCase().includes(q.toLowerCase())) : TECHS;
  renderTechs(filtered);
}

function toggleTech(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  const n = selected.size;
  document.getElementById('cr-sel-count').textContent = `${n} tecnología${n!==1?'s':''} seleccionada${n!==1?'s':''}`;
  document.getElementById('cr-analyze-btn').disabled = n === 0;
  renderTechs(filtered);
}

function runAnalysis() {
  const allCwes = [];
  selected.forEach(id => { (CWE_DATA[id]||[]).forEach(c => allCwes.push({...c, tech:id})); });

  const deduped = [];
  const seen = new Set();
  allCwes.forEach(c => { if(!seen.has(c.id)) { seen.add(c.id); deduped.push(c); } });

  const critical = deduped.filter(c=>c.sev==='critical');
  const high = deduped.filter(c=>c.sev==='high');
  const medium = deduped.filter(c=>c.sev==='medium');
  const totalCves = deduped.reduce((s,c)=>s+c.cves,0);
  const score = Math.min(100, Math.round((critical.length*25 + high.length*12 + medium.length*5)));

  document.getElementById('cr-result-sub').textContent = '// ' + Array.from(selected).map(id=>TECHS.find(t=>t.id===id)?.name).join(' · ');
  document.getElementById('cr-result-date').textContent = new Date().toISOString().slice(0,19).replace('T',' ') + ' UTC';
  document.getElementById('cr-exp-score').textContent = score + '/100';
  document.getElementById('cr-exp-score').style.color = score>=70?'#e84040':score>=40?'#f0a500':'#2ecc71';
  document.getElementById('sc-critical').textContent = critical.length;
  document.getElementById('sc-high').textContent = high.length;
  document.getElementById('sc-medium').textContent = medium.length;
  document.getElementById('sc-cves').textContent = totalCves;

  setTimeout(()=>{ document.getElementById('cr-bar-fill').style.width = score+'%'; }, 100);

  const cweHtml = [...critical,...high,...medium].map(c=>`
    <div class="cr-cwe-item sev-${c.sev}">
      <div class="cr-cwe-top">
        <span class="cr-cwe-id">${c.id}</span>
        <span class="cr-cwe-name">${c.name}</span>
        <span class="cr-sev-badge ${c.sev}">${c.sev.toUpperCase()}</span>
      </div>
      <div class="cr-cwe-meta">
        <span class="cr-cwe-desc">${c.desc}</span>
        <span class="cr-affected">${c.cves} CVEs</span>
      </div>
    </div>`).join('');
  document.getElementById('cr-cwe-list').innerHTML = cweHtml || '<div style="color:#2e4a60;font-size:.8rem;">No se encontraron CWEs para el stack seleccionado.</div>';

  const recSrc = critical.length ? RECS.critical : high.length ? RECS.high : RECS.medium;
  document.getElementById('cr-rec-list').innerHTML = recSrc.map((r,i)=>`
    <div class="cr-rec-item">
      <span class="cr-rec-num">R${String(i+1).padStart(2,'0')}</span>
      <span class="cr-rec-text">${r}</span>
    </div>`).join('');

  document.getElementById('cr-empty').style.display = 'none';
  document.getElementById('cr-result').classList.add('visible');
  document.querySelector('.cr-right').scrollTop = 0;
}

renderTechs(TECHS);