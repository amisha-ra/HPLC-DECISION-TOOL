(function (app) {
app.initializeEquipmentTab = function initializeEquipmentTab(equipmentReference) {
  const moduleList = document.querySelector('[data-equipment-modules]');
  const parameterBody = document.querySelector('[data-equipment-parameters]');
  const directResponseList = document.querySelector('[data-direct-responses]');
  const calculatedResponseList = document.querySelector('[data-calculated-responses]');

  if (!moduleList || !parameterBody || !directResponseList || !calculatedResponseList) return;

  renderModules(moduleList, equipmentReference.modules);
  renderParameters(parameterBody, equipmentReference.parameters);
  renderResponses(directResponseList, equipmentReference.fileResponses, 'file-response');
  renderResponses(calculatedResponseList, equipmentReference.derivedResponses, 'derived-response');
  const selectableGroups = [
    { container: moduleList, selector: '[data-module-id]' },
    { container: parameterBody, selector: 'tr[data-parameter-row]' },
    { container: directResponseList, selector: '[data-response-row]' },
    { container: calculatedResponseList, selector: '[data-response-row]' }
  ];
  const selectEquipmentItem = (selectedItem) => {
    const deselect = selectedItem.classList.contains('is-selected');
    for (const { container, selector } of selectableGroups) {
      container.querySelectorAll(selector).forEach((item) => {
        const isSelected = !deselect && item === selectedItem;
        item.classList.toggle('is-selected', isSelected);
        if (item.dataset.moduleId !== undefined || item.dataset.responseRow !== undefined) {
          item.setAttribute('aria-pressed', String(isSelected));
        }
        if (item.dataset.parameterRow !== undefined) {
          if (isSelected) item.setAttribute('aria-current', 'true');
          else item.removeAttribute('aria-current');
        }
      });
    }
  };

  moduleList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-module-id]');
    if (!button) return;

    const selectedModule = equipmentReference.modules.find((module) => module.id === button.dataset.moduleId);
    if (selectedModule) showEquipmentDetail(selectedModule, equipmentReference.parameters);
  selectEquipmentItem(button);
  });

  parameterBody.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-parameter-row]');
    if (row) selectEquipmentItem(row);
  });

  parameterBody.addEventListener('keydown', (event) => {
    const row = event.target.closest('tr[data-parameter-row]');
    if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;

    event.preventDefault();
    selectEquipmentItem(row);
  });

  for (const responseList of [directResponseList, calculatedResponseList]) {
    responseList.addEventListener('click', (event) => {
      const item = event.target.closest('[data-response-row]');
      if (item) selectEquipmentItem(item);
    });

    responseList.addEventListener('keydown', (event) => {
      const item = event.target.closest('[data-response-row]');
      if (!item || (event.key !== 'Enter' && event.key !== ' ')) return;

      event.preventDefault();
      selectEquipmentItem(item);
    });
  }
}

function renderModules(container, modules) {
  const fragment = document.createDocumentFragment();

  modules.forEach((module, index) => {
    const button = document.createElement('button');
    button.className = 'module-button';
    button.type = 'button';
    button.dataset.moduleId = module.id;
    button.setAttribute('aria-pressed', 'false');

    const name = document.createElement('span');
    name.className = 'module-button-name';
    name.textContent = module.name;

    button.append(name);
    fragment.append(button);

    if (index < modules.length - 1) {
      const separator = document.createElement('span');
      separator.className = module.name === 'Column' ? 'module-separator module-combination' : 'module-separator module-flow';
      separator.setAttribute('aria-hidden', 'true');
      fragment.append(separator);
    }
  });

  container.replaceChildren(fragment);
}

function renderParameters(container, parameters) {
  const fragment = document.createDocumentFragment();

  for (const parameter of parameters) {
    const row = document.createElement('tr');
    row.dataset.parameterRow = '';
    row.tabIndex = 0;
    row.setAttribute('aria-label', `Select ${parameter.parameterName} parameter row`);
    const unitText = parameter.units ?? 'Units not configured';
    const values = [
      { text: parameter.parameterName, className: 'parameter-name' },
      { text: parameter.category },
      { text: parameter.controllingModule ?? 'Not configured', className: parameter.controllingModule ? '' : 'not-configured' },
      { text: parameter.availableRange ? parameter.availableRange.replace(/;\s*(common:)/i, '\n$1') : `Not supplied · ${unitText}`, className: parameter.availableRange ? 'parameter-range' : 'not-configured' },
      { text: parameter.chromatographicEffect ?? 'Not configured', className: parameter.chromatographicEffect ? '' : 'not-configured' }
    ];

    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value.text;
      if (value.className) cell.className = value.className;
      row.append(cell);
    });

    fragment.append(row);
  }

  container.replaceChildren(fragment);
}

function renderResponses(container, responses, className) {
  const fragment = document.createDocumentFragment();

  for (const response of responses) {
    const item = document.createElement('div');
    item.className = 'response-item';
    item.dataset.responseRow = '';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Select ${response.name}`);
    item.setAttribute('aria-pressed', 'false');

    const heading = document.createElement('div');
    heading.className = 'response-item-heading';
    const name = document.createElement('strong');
    name.textContent = response.name;
    const units = document.createElement('span');
    units.textContent = response.units;
    heading.append(name, units);

    const source = document.createElement('span');
    source.className = 'response-item-source';
    source.textContent = response.source ?? response.basis;

    item.append(heading, source);
    const statusText = response.status ?? '';
    if (statusText) {
      const status = document.createElement('span');
      status.className = `response-item-status ${className}`;
      status.textContent = statusText;
      item.append(status);
    }
    fragment.append(item);
  }

  container.replaceChildren(fragment);
}

function showEquipmentDetail(item, parameters) {
  const title = document.querySelector('#equipment-detail-title');
  const functionField = document.querySelector('[data-equipment-function]');
  const columnSelector = document.querySelector('[data-column-selector]');
  const alterations = document.querySelector('[data-equipment-alterations]');
  const effects = document.querySelector('[data-equipment-effects]');
  const chromatogram = document.querySelector('[data-equipment-chromatogram]');

  if (!title || !functionField || !columnSelector || !alterations || !effects || !chromatogram) return;

  title.textContent = item.name;
  functionField.textContent = item.function ?? 'Not supplied in the specification';
  columnSelector.hidden = item.name !== 'Column';
  const mappedParameters = parameters.filter((parameter) => parameter.controllingModule === item.name);
  const alterationsText = item.whatCanAlter ?? (mappedParameters.length
    ? mappedParameters.map((parameter) => `${parameter.parameterName} (range not supplied; units ${parameter.units ?? 'not configured'})`).join('; ')
    : 'No parameters are mapped to this module in the specification.');
  renderHighlightedText(alterations, alterationsText, item.whatCanAlterBoldPhrases ?? []);
  const effectsText = item.chromatographicEffects ?? 'Not supplied in the specification';
  renderHighlightedText(effects, effectsText, item.chromatographicEffectsBoldPhrases ?? []);
  chromatogram.textContent = item.chromatogramEffect ?? 'Not supplied in the specification';
}

function renderHighlightedText(element, text, phrases) {
  if (phrases.length === 0) {
    element.textContent = text;
    return;
  }

  const textContent = document.createElement('span');
  textContent.className = 'equipment-detail-rich-text';
  let currentPosition = 0;

  for (const phrase of phrases) {
    const phrasePosition = text.indexOf(phrase, currentPosition);
    if (phrasePosition < 0) continue;

    textContent.append(document.createTextNode(text.slice(currentPosition, phrasePosition)));
    const boldText = document.createElement('b');
    boldText.textContent = phrase;
    textContent.append(boldText);
    currentPosition = phrasePosition + phrase.length;
  }

  textContent.append(document.createTextNode(text.slice(currentPosition)));
  element.replaceChildren(textContent);
}

})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});