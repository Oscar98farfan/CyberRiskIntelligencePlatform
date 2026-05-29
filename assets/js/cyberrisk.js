'use strict';

/* ==========================================
ESTADO GLOBAL
========================================== */

let TECH_CATALOG = [];
let QUESTIONS = [];

let selectedTechs = [];

let currentCat = '';
let currentVendor = '';
let currentProduct = '';

let currentTechIndex = 0;

document.addEventListener('DOMContentLoaded', init);

async function init() {

  try {

    const catalogData =
      await fetchJSON('/data/tech-catalog.json');

    const questionData =
      await fetchJSON('/data/questions-config.json');

    TECH_CATALOG =
      catalogData.catalog || [];

    QUESTIONS =
      questionData.questions || [];

    loadCategories();

    document.getElementById('catalog-loader').style.display = 'none';

    document.getElementById('catalog-form').style.display = 'block';

    document.getElementById('cr-status-text').textContent =
      'DATOS CARGADOS';

  }
  catch (error) {

    console.error(error);

    document.getElementById('cr-status-text').textContent =
      'ERROR DE CARGA';

  }

}



function loadCategories() {

  const selCat =
    document.getElementById('sel-cat');

  const categories =
    [...new Set(
      TECH_CATALOG.map(x => x.cat)
    )];

  categories.forEach(cat => {

    selCat.innerHTML +=
      `<option value="${cat}">
                ${cat}
            </option>`;

  });

}



document.addEventListener('change', (e) => {

  if (e.target.id === 'sel-cat') {

    loadVendors(e.target.value);

  }

  if (e.target.id === 'sel-vendor') {

    loadProducts(
      document.getElementById('sel-cat').value,
      e.target.value
    );

  }

  if (e.target.id === 'sel-product') {

    document.getElementById('add-tech-btn').disabled = false;

  }

});


function loadVendors(cat) {

  const selVendor =
    document.getElementById('sel-vendor');

  selVendor.innerHTML =
    '<option value="">Seleccione</option>';

  const vendors =
    TECH_CATALOG
      .filter(x => x.cat === cat)
      .map(x => x.vendor);

  vendors.forEach(v => {

    selVendor.innerHTML +=
      `<option value="${v}">
                ${v}
            </option>`;

  });

  selVendor.disabled = false;

}


function loadProducts(cat, vendor) {

  const selProduct =
    document.getElementById('sel-product');

  selProduct.innerHTML =
    '<option value="">Seleccione</option>';

  const record =
    TECH_CATALOG.find(x =>
      x.cat === cat &&
      x.vendor === vendor
    );

  if (!record) return;

  record.products.forEach(product => {

    selProduct.innerHTML +=
      `<option value="${product}">
                ${product}
            </option>`;

  });

  selProduct.disabled = false;

}



function addTech() {

  const tech = {

    cat:
      document.getElementById('sel-cat').value,

    vendor:
      document.getElementById('sel-vendor').value,

    product:
      document.getElementById('sel-product').value,

    description:
      document.getElementById('inp-desc').value

  };

  selectedTechs.push(tech);

  renderTechCards();

  // renderQuestions();

}



function renderTechCards() {
  const container =
    document.getElementById('tech-cards');
  if (!selectedTechs.length) {
    container.innerHTML =
      '<div class="cr-no-techs">Ninguna tecnología añadida aún</div>';
    return;
  }
  container.innerHTML =
    selectedTechs.map((t, i) => `
        <div class="cr-tech-card">
            <strong>${t.product}</strong>
            <div>${t.vendor}</div>
            <small>${t.cat}</small>
        </div>
    `).join('');
  document.getElementById('tech-count-badge').textContent =
    selectedTechs.length;
  document.getElementById('fc-techs').textContent =
    selectedTechs.length;
}


// function renderQuestions() {
//   const container =
//     document.getElementById('q-content');
//   let html = '';
//   selectedTechs.forEach((tech, index) => {
//     html += `
//         <div class="cr-panel-scroll">
//             <h3>${tech.product}</h3>
//         `;
//     QUESTIONS.forEach(q => {
//       html += `
//             <div class="cr-question">
//                 <label>${q.text}</label>
//                 <select
//                     data-tech="${index}"
//                     data-question="${q.id}"
//                 >
//                     <option value="0">No</option>
//                     <option value="1">Sí</option>
//                 </select>
//             </div>
//             `;
//     });
//     html += '</div>';
//   });
//   container.innerHTML = html;
// }




// function showStep(step) {

//   document
//     .querySelectorAll('.cr-panel')
//     .forEach(panel => panel.classList.remove('active'));

//   const panel =
//     document.getElementById(`panel-${step}`);

//   if (panel) {
//     panel.classList.add('active');
//   }

//   document
//     .querySelectorAll('.cr-nav-btn')
//     .forEach(btn => btn.classList.remove('active'));

//   const btn =
//     document.getElementById(`btn-step${step}`);

//   if (btn) {
//     btn.classList.add('active');
//   }

//   // NUEVO
//   if (step === 3) {
//     generateJSON();
//   }

// }


function copyJSON() {

  const json =
    document.getElementById('json-output').textContent;

  navigator.clipboard.writeText(json);

  alert('JSON copiado');

}
window.copyJSON = copyJSON;




function runAnalysis() {

  generateJSON();

  alert('Análisis ejecutado');

}

window.runAnalysis = runAnalysis;


function generateJSON() {

  const payload = selectedTechs.map((tech, index) => {

    const answers = {};

    QUESTIONS.forEach(q => {

      const control =
        document.querySelector(
          `[data-tech="${index}"][data-question="${q.id}"]`
        );

      answers[q.id] =
        control
          ? Number(control.value)
          : 0;

    });

    return {

      technology: tech.product,

      vendor: tech.vendor,

      category: tech.cat,

      description: tech.description,

      ...answers

    };

  });

  document.getElementById(
    'json-output'
  ).textContent =
    JSON.stringify(
      payload,
      null,
      2
    );

  document.getElementById(
    'json-preview-dash'
  ).textContent =
    JSON.stringify(
      payload,
      null,
      2
    );

  document.getElementById(
    'json-records-count'
  ).textContent =
    `${payload.length} registros · ${selectedTechs.length} tecnologías`;

  return payload;

}




function renderQuestionnaire() {

  console.log("Renderizando tecnología:", currentTechIndex);

  if (!selectedTechs.length) {
    return;
  }

  const tech = selectedTechs[currentTechIndex];

  document.getElementById('current-tech-name').textContent =
    tech.product;

  document.getElementById('question-progress').textContent =
    `${currentTechIndex + 1} / ${selectedTechs.length}`;

  let html = '';

  QUESTIONS.forEach(q => {

    html += `
            <div class="cr-question-card">
                <div class="cr-question-title">
                    ${q.text}
                </div>

                <select
                    data-tech="${currentTechIndex}"
                    data-question="${q.id}">
                    <option value="0">No</option>
                    <option value="1">Sí</option>
                </select>
            </div>
        `;
  });

  document.getElementById('question-container').innerHTML = html;
}


// function renderQuestionnaire() {

//   if (!selectedTechs.length) {
//     return;
//   }

//   const tech =
//     selectedTechs[currentTechIndex];

//   document.getElementById(
//     'current-tech-name'
//   ).textContent =
//     tech.product;

//   document.getElementById(
//     'question-progress'
//   ).textContent =
//     `${currentTechIndex + 1} / ${selectedTechs.length}`;

//   let html = '';

//   QUESTIONS.forEach(q => {

//     html += `
//             <div class="cr-question-card">

//                 <div class="cr-question-title">
//                     ${q.text}
//                 </div>

//                 <select
//                     data-tech="${currentTechIndex}"
//                     data-question="${q.id}"
//                 >
//                     <option value="0">No</option>
//                     <option value="1">Sí</option>
//                 </select>

//             </div>
//         `;

//   });

//   document.getElementById(
//     'question-container'
//   ).innerHTML =
//     html;

// }


function nextTech() {

  if (
    currentTechIndex <
    selectedTechs.length - 1
  ) {

    currentTechIndex++;

    renderQuestionnaire();

  }

}

function previousTech() {

  if (
    currentTechIndex > 0
  ) {

    currentTechIndex--;

    renderQuestionnaire();

  }

}


function showStep(step) {

  document
    .querySelectorAll('.cr-panel')
    .forEach(p =>
      p.classList.remove('active')
    );

  document
    .getElementById(`panel-${step}`)
    ?.classList.add('active');

  document
    .querySelectorAll('.cr-nav-btn')
    .forEach(btn =>
      btn.classList.remove('active')
    );

  document
    .getElementById(`btn-step${step}`)
    ?.classList.add('active');

  if (
    step === 2 &&
    selectedTechs.length
  ) {

    renderQuestionnaire();

  }

  if (step === 3) {

    generateJSON();

  }

}



window.showStep = showStep;
window.nextTech = nextTech;
window.previousTech = previousTech;
window.generateJSON = generateJSON;