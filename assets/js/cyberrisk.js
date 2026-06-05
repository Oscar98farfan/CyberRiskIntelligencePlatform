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




// async function runAnalysis() {
//   try {
//     if (selectedTechs.length === 0) {
//       alert("debes agregar al menos una tecnologia.")
//       return;
//     }
//     const payload = generateJSON();
//     // 1. Guardar el json
//     const response = await fetch(
//       'http://127.0.0.1:5000/guardar-json',
//       {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify(payload)
//       }
//     );
//     const result = await response.json();
//     console.log(result);
//     alert(`Archivo guardado correctamente.\nID: ${result.id}`);

//     // 2. Ejecutar el analisis
//     const analysisResponse = await fetch("http://127.0.0.1:5000/analizar", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ id: result.id })
//     });

//     // ← AGREGAR ESTO para ver el error real
//     if (!analysisResponse.ok) {
//       const errorText = await analysisResponse.text();
//       console.error("Error del servidor:", errorText);
//       alert("Error del servidor: " + errorText);
//       return;
//     }

//     const analysisResult = await analysisResponse.json();

//     // const analysisResponse = await fetch(
//     //   "http://127.0.0.1:5000/analizar",
//     //   {
//     //     method: "POST",
//     //     headers: {
//     //       "Content-Type": "application/json"
//     //     },
//     //     body: JSON.stringify({
//     //       id: result.id
//     //     })
//     //   }
//     // );
//     // const analysisResult =
//     //   await analysisResponse.json();

//     console.log("Resultado ML:", analysisResult);
//     alert(`Tier: ${analysisResult.prediction.tier}\nScore: ${analysisResult.prediction.score}`);

//     // 3. Guardar resultado globalmente
//     window.mlResult =
//       analysisResult;
//     alert(`Análisis completado.\nID: ${result.id}`);
//   }

//   catch (error) {
//     console.error(error);
//     alert(
//       'Error enviando información al backend'
//     );
//   }
// }




// async function runAnalysis() {
//   try {
//     if (selectedTechs.length === 0) {
//       alert("debes agregar al menos una tecnologia.");
//       return;
//     }

//     const payload = generateJSON();

//     // 1. Guardar el JSON
//     const response = await fetch('http://127.0.0.1:5000/guardar-json', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
//     const result = await response.json();
//     console.log("✅ Guardado:", result);

//     // 2. Ejecutar el análisis
//     const analysisResponse = await fetch('http://127.0.0.1:5000/analizar', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ id: result.id })
//     });

//     console.log("📡 Status analizar:", analysisResponse.status);

//     const analysisResult = await analysisResponse.json();

//     // ← Este es el que no estás viendo
//     console.log("🧠 Resultado ML:", analysisResult);
//     console.log("Tier:", analysisResult.prediction.tier);
//     console.log("Score:", analysisResult.prediction.score);

//     window.mlResult = analysisResult;

//   } catch (error) {
//     console.error("❌ Error:", error);
//   }
// }


// window.runAnalysis = runAnalysis;




// Genera el payload puro sin tocar el DOM
function buildPayload() {
  return selectedTechs.map((tech, index) => {
    const answers = {};
    QUESTIONS.forEach(q => {
      const control = document.querySelector(
        `[data-tech="${index}"][data-question="${q.id}"]`
      );
      answers[q.id] = control ? Number(control.value) : 0;
    });
    return {
      technology: tech.product,
      vendor: tech.vendor,
      category: tech.cat,
      description: tech.description,
      ...answers
    };
  });
}

// Actualiza el DOM con el JSON (solo cuando los elementos existen)
function generateJSON() {
  const payload = buildPayload();

  const outEl = document.getElementById('json-output');
  const dashEl = document.getElementById('json-preview-dash');
  const countEl = document.getElementById('json-records-count');

  const text = JSON.stringify(payload, null, 2);

  if (outEl) outEl.textContent = text;
  if (dashEl) dashEl.textContent = text;
  if (countEl) countEl.textContent =
    `${payload.length} registros · ${selectedTechs.length} tecnologías`;

  return payload;
}



// runAnalysis usa buildPayload, no generateJSON
async function runAnalysis(event) {
  if (event) event.preventDefault();

  try {
    if (selectedTechs.length === 0) {
      alert("Debes agregar al menos una tecnología.");
      return;
    }

    const payload = buildPayload(); // ← sin tocar DOM

    // 1. Guardar
    const saveRes = await fetch('http://127.0.0.1:5000/guardar-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const saveData = await saveRes.json();
    console.log("✅ Guardado:", saveData);

    // 2. Analizar
    const analRes = await fetch('http://127.0.0.1:5000/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: saveData.id })
    });

    if (!analRes.ok) {
      const err = await analRes.text();
      console.error("❌ Error servidor:", err);
      return;
    }

    const result = await analRes.json();
    console.log("🧠 Resultado ML:", result);

    window.mlResult = result;

    // Mostrar resultado en pantalla en vez de alert
    const outEl = document.getElementById('json-output');
    if (outEl) outEl.textContent = JSON.stringify(result, null, 2);

    alert(`✅ Análisis completado\nTier: ${result.prediction.tier}\nScore: ${result.prediction.score}`);

  } catch (error) {
    console.error("❌ Error:", error);
    alert("Error: " + error.message);
  }
}

window.runAnalysis = runAnalysis;
window.generateJSON = generateJSON;
window.buildPayload = buildPayload;

// function generateJSON() {

//   const payload = selectedTechs.map((tech, index) => {

//     const answers = {};

//     QUESTIONS.forEach(q => {

//       const control =
//         document.querySelector(
//           `[data-tech="${index}"][data-question="${q.id}"]`
//         );

//       answers[q.id] =
//         control
//           ? Number(control.value)
//           : 0;

//     });

//     return {

//       technology: tech.product,

//       vendor: tech.vendor,

//       category: tech.cat,

//       description: tech.description,

//       ...answers

//     };

//   });

//   document.getElementById(
//     'json-output'
//   ).textContent =
//     JSON.stringify(
//       payload,
//       null,
//       2
//     );

//   document.getElementById(
//     'json-preview-dash'
//   ).textContent =
//     JSON.stringify(
//       payload,
//       null,
//       2
//     );

//   document.getElementById(
//     'json-records-count'
//   ).textContent =
//     `${payload.length} registros · ${selectedTechs.length} tecnologías`;

//   return payload;

// }




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