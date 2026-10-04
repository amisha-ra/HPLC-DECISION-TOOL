(function (app) {
  function valueText(value, unit = '') {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return value;
    return `${value}${unit ? ` ${unit}` : ''}`;
  }

  function equipmentParameterName(decision, parameterName) {
    const normalizedName = String(parameterName || '').trim().toLowerCase();
    const exactMatches = new Map([
      ['%b', '%B / mobile phase composition'],
      ['temperature or solvent', 'Temperature'],
      ['solvent type and %b', 'Solvent type'],
      ['spp/coreshell', 'Coreshell present']
    ]);
    if (exactMatches.has(normalizedName)) return exactMatches.get(normalizedName);
    if (normalizedName === 'efficiency options') {
      const recommendation = `${decision?.action || ''} ${decision?.equipmentAction?.recommendedValue || ''}`.toLowerCase();
      if (recommendation.includes('column length')) return 'Column length';
      if (recommendation.includes('particle size')) return 'Particle size';
      if (recommendation.includes('flow rate')) return 'Flow rate';
      if (recommendation.includes('spp/coreshell')) return 'Coreshell present';
      return null;
    }
    const equipmentParameters = [
      'Solvent type', '%B / mobile phase composition', 'Flow rate', 'Injection volume',
      'Sample concentration', 'Ligand', 'Bead type', 'Coreshell present', 'Pore size',
      'Carbon load', 'Column length', 'Column internal diameter', 'Particle size',
      'Temperature', 'Wavelength'
    ];
    return equipmentParameters.find((name) => name.toLowerCase() === normalizedName) || null;
  }

  function parameterChangeRange(action, parameterName, decision, appState) {
    const parameter = String(parameterName || '').trim().toLowerCase();
    if (parameter === '%b') return '0-100%B';
    if (parameter === 'flow rate') {
      const direction = /decrease/i.test(String(action?.recommendedValue || '')) ? '<' : '>';
      const currentFlowRate = valueText(action?.currentValue, 'mL/min');
      return `mL/min ${direction} current (${currentFlowRate})`;
    }
    if (parameter === 'temperature' || parameter === 'temperature or solvent') return '°C between amb (25°C) and 60°C';
    if (parameter === 'ligand') return 'no units; change column ligand';
    if (parameter === 'column length') return 'column length in mm';
    if (parameter === 'particle size') return 'particle size; um';
    if (parameter === 'spp/coreshell' || parameter === 'coreshell present') return 'no units; column may be SPP (coreshell) or FPP (no coreshell)';
    if (parameter === 'efficiency options') return 'Pump/column options; see decision';
    if (action?.range && action.range !== 'Not configured') return `${action.range}${action.units ? `; ${action.units}` : ''}`;
    const catalogName = equipmentParameterName(decision, parameterName);
    const catalogParameter = appState.equipmentInformation?.parameters?.find((entry) => entry.parameterName === catalogName);
    if (catalogParameter?.availableRange) return catalogParameter.availableRange;
    if (action?.units) return action.units;
    return 'Not applicable';
  }

  function parameterChangeCurrentNext(action, parameterName, conditions, nextConditions, decision, appState) {
    const parameter = String(parameterName || '').trim().toLowerCase();
    if (parameter === 'column length') {
      const currentLength = Number(action?.currentValue ?? conditions.columnLengthMm);
      const availableLengths = [30, 50, 100, 150, 200, 250].filter((length) => length !== currentLength);
      return `${valueText(currentLength, 'mm')} → ${availableLengths.join(', ')} mm`;
    }
    if (parameter === 'particle size') {
      const currentSize = Number(action?.currentValue ?? conditions.particleSizeUm);
      const availableSizes = [1.8, 1.9, 2.7, 3, 5].filter((size) => size !== currentSize);
      return `${valueText(currentSize, 'um')} → ${availableSizes.join(', ')} um`;
    }
    if (parameter === 'spp/coreshell' || parameter === 'coreshell present') return 'Implement SPP/coreshell';
    if (parameter === 'efficiency options') {
      return `Current setup → ${action?.recommendedValue || decision?.action || 'Review the recommended efficiency options'}`;
    }
    if (!action && parameter === 'no change required') return 'Current conditions → unchanged';
    const conditionKeys = {
      '%b': 'percentB',
      'solvent type': 'solventType',
      'flow rate': 'flowRateMlMin',
      'injection volume': 'injectionVolumeUl',
      'sample concentration': 'sampleConcentrationMgMl',
      ligand: 'ligand',
      'bead type': 'beadType',
      'coreshell present': 'coreshellPresent',
      'pore size': 'poreSizeA',
      'carbon load': 'carbonLoadPercent',
      'column length': 'columnLengthMm',
      'column internal diameter': 'columnInternalDiameterMm',
      'particle size': 'particleSizeUm',
      temperature: 'temperatureC',
      wavelength: 'wavelengthNm'
    };
    const key = conditionKeys[parameter];
    const catalogName = equipmentParameterName(decision, parameterName);
    const catalogParameter = appState.equipmentInformation?.parameters?.find((entry) => entry.parameterName === catalogName);
    const units = action?.units ?? catalogParameter?.units ?? '';
    const currentValue = action?.currentValue ?? conditions[key];
    const recommendedValue = action?.recommendedValue ?? nextConditions?.displayOverrides?.[key] ?? nextConditions?.[key];
    const format = (value) => value === null || value === undefined || value === '' ? 'Not available' : valueText(value, units);
    if (!action && !key) return 'Current conditions → unchanged';
    return `${format(currentValue)} → ${format(recommendedValue)}`;
  }

  function columnText(conditions) {
    const values = [conditions.ligand, conditions.beadType].filter(Boolean);
    const length = conditions.columnLengthMm;
    const diameter = conditions.columnInternalDiameterMm;
    const particle = conditions.particleSizeUm;
    if ([length, diameter, particle].every((value) => value !== null && value !== undefined && value !== '')) {
      values.push(`${length}mmx${diameter}mmx${particle}um`);
    }
    if (conditions.coreshellPresent !== null && conditions.coreshellPresent !== undefined && conditions.coreshellPresent !== '') {
      values.push(`Coreshell: ${conditions.coreshellPresent}`);
    }
    return values.length ? values.join(', ') : '—';
  }

  function columnRecommendation(conditions, overrides) {
    const recommendations = [];
    const lengthAdvice = String(overrides.columnLengthMm || '');
    const availableLengths = [30, 50, 100, 150, 200, 250];
    if (/decrease/i.test(lengthAdvice)) {
      const shorter = availableLengths.filter((length) => length < Number(conditions.columnLengthMm)).sort((first, second) => second - first);
      recommendations.push(shorter.length ? `Decrease column length to: ${shorter.map((length) => `${length}mm`).join(', OR ')}` : 'No listed shorter column length is available.');
    } else if (lengthAdvice) {
      recommendations.push(lengthAdvice);
    }
    const particleAdvice = String(overrides.particleSizeUm || '');
    if (/decrease/i.test(particleAdvice)) {
      const sizes = [1.8, 1.9, 2.7, 3, 5].filter((size) => size < Number(conditions.particleSizeUm)).sort((first, second) => first - second);
      recommendations.push(sizes.length ? `Decrease particle size to: ${sizes.map((size) => `${size}um`).join(', OR ')}` : 'No listed smaller particle size is available.');
    }
    if (/SPP|coreshell/i.test(particleAdvice) || /SPP|coreshell/i.test(String(overrides.coreshellPresent || ''))) {
      recommendations.push('Implement SPP/Coreshell: yes');
    }
    return [columnText(conditions), ...recommendations].filter((value) => value && value !== '—').join('\n') || '—';
  }

  function createButton(label, choice) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.decisionChoice = choice;
    return button;
  }

  function createNumberInput(labelText, placeholder, datasetKey, value = '') {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.placeholder = placeholder;
    input.dataset[datasetKey] = 'true';
    if (value !== null && value !== undefined && value !== '') input.value = String(value);
    label.append(input);
    return { label, input };
  }

  function renderDecisionControls(container, decision, state) {
    container.replaceChildren();
    const interaction = decision?.interaction;
    if (!interaction) {
      container.hidden = true;
      return;
    }
    if (interaction.type === 'selectivity-optimal-percent-b') {
      container.hidden = true;
      return;
    }
    if (interaction.type === 'retention-observe') {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    if (interaction.type === 'retention-selectivity-observe') {
      if (state.post60Choice === 'ANOTHER_TEMPERATURE') {
        const temperature = createNumberInput('Other temperature (°C)', 'Enter temperature', 'customTemperatureC', state.customTemperatureC);
        container.append(temperature.label, createButton('Use temperature', 'set-custom-temperature'));
      } else {
        container.append(createButton('Test another temperature', 'another-temperature'), createButton('Change solvent', 'change-solvent'));
      }
    } else if (interaction.type === 'changed-solvent-temperature-choice') {
      if (state.post60Choice === 'YES') {
        const temperature = createNumberInput('Other temperature (°C)', 'Enter temperature', 'customTemperatureC', state.customTemperatureC);
        container.append(temperature.label, createButton('Use temperature', 'set-custom-temperature'));
      } else {
        container.append(createButton('Yes', 'changed-solvent-yes'), createButton('No', 'changed-solvent-no'));
      }
    } else if (interaction.type === 'manual-solvent-percent-b') {
      const percentB = createNumberInput(`Enter %B of ${interaction.solventType}`, 'Enter %B of new solvent manually', 'manualSolventPercentB', state.manualSolventPercentB);
      percentB.input.min = '0';
      percentB.input.max = '100';
      percentB.input.setAttribute('aria-label', `Enter %B of ${interaction.solventType}`);
      container.append(percentB.label, createButton('Use this %B', 'manual-solvent-percent-b'));
    }
  }

  function renderDecisionOutput(run, decision, appState) {
    const runId = document.querySelector('[data-decision-run-id]');
    const message = document.querySelector('.decision-message');
    const reasonHeading = document.querySelector('[data-decision-reason-heading]');
    const reasonBody = document.querySelector('[data-decision-reason]');
    const status = document.querySelector('.decision-state');
    const nextRunSummary = document.querySelector('[data-next-run-summary]');
    const controls = document.querySelector('[data-decision-controls]');
    const conditions = run?.conditions || {};
    const next = decision?.nextConditions || conditions;
    const overrides = next.displayOverrides || {};
    const state = appState.methodDevelopmentState || {};
    const reasonText = [
      decision?.reason,
      decision?.statusSummary && !String(decision.reason || '').includes(decision.statusSummary) ? decision.statusSummary : ''
    ].filter(Boolean).join('\n\n');
    if (runId) {
      const groupNumber = String(run?.metadata?.groupIdentifier || '').replace(/^GR/i, '');
      const injectionRunNumber = String(run?.metadata?.injectionRunIdentifier || '');
      runId.hidden = !run;
      runId.textContent = `GR:${groupNumber || '—'} RUN:${injectionRunNumber || '—'}`;
    }
    if (message) {
      const action = document.createElement('span');
      action.className = 'decision-action';
      action.textContent = decision?.action || 'Upload a run to begin review.';
      message.replaceChildren(action);
      if (decision?.status === 'LIGAND_CHANGE_REQUIRED') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'decision-ligand-button';
        button.textContent = 'Click to view other ligands/columns';
        button.addEventListener('click', () => {
          document.querySelector('[data-dashboard-tab="equipment"]')?.click();
          const columnModule = [...document.querySelectorAll('[data-module-id]')]
            .find((moduleButton) => moduleButton.textContent.trim() === 'Column');
          columnModule?.click();
        });
        message.append(document.createElement('br'), document.createElement('br'), button);
      }
    }
    if (reasonHeading && reasonBody) {
      const showReason = Boolean(reasonText);
      reasonHeading.hidden = !showReason;
      reasonBody.hidden = !showReason;
      reasonBody.textContent = reasonText;
      reasonBody.classList.toggle('decision-reason-compact', Boolean(decision?.suppressEvidence));
    }
    if (status) {
      status.textContent = decision?.status ? decision.status.replaceAll('_', ' ') : 'AWAITING DATA';
      status.dataset.decisionStatus = decision?.status || 'AWAITING_DATA';
    }

    const values = {
      ligandColumn: overrides.ligandColumn ?? overrides.ligand ?? columnRecommendation(next, overrides),
      solventType: overrides.solventType ?? valueText(next.solventType),
      percentB: overrides.percentB ?? valueText(next.percentB, '%'),
      flowRateMlMin: overrides.flowRateMlMin ?? valueText(next.flowRateMlMin, 'mL/min'),
      particleSizeUm: overrides.particleSizeUm ?? valueText(next.particleSizeUm, 'µm'),
      temperatureC: overrides.temperatureC ?? valueText(next.temperatureC, '°C')
    };
    for (const [key, value] of Object.entries(values)) {
      const output = document.querySelector(`[data-next-condition="${key}"]`);
      if (!output) continue;
      output.textContent = value;
    }
    if (nextRunSummary) nextRunSummary.textContent = 'Conditions for the next run are shown below.';

    const parameter = document.querySelector('[data-decision-parameter]');
    const module = document.querySelector('[data-decision-module]');
    const range = document.querySelector('[data-decision-range]');
    const currentNext = document.querySelector('[data-decision-current-next]');
    const effect = document.querySelector('[data-decision-effect]');
    const equipmentParameterButton = document.querySelector('[data-decision-equipment-parameter]');
    const action = decision?.equipmentAction;
    const parameterName = action?.parameter || decision?.changedParameter || 'No parameter change required';
    const equipmentParameter = equipmentParameterName(decision, parameterName);
    const equipmentParameterEntry = appState.equipmentInformation?.parameters?.find((entry) => entry.parameterName === equipmentParameter);
    if (parameter) parameter.textContent = parameterName;
    if (module) module.textContent = action?.controllingModule || equipmentParameterEntry?.controllingModule || 'Not applicable';
    if (range) range.textContent = parameterChangeRange(action, parameterName, decision, appState);
    if (currentNext) currentNext.textContent = parameterChangeCurrentNext(action, parameterName, conditions, next, decision, appState);
    if (effect) effect.textContent = action?.effect || decision?.reason || decision?.action || 'No parameter change is required for this decision.';
    if (equipmentParameterButton) {
      equipmentParameterButton.dataset.parameterTarget = equipmentParameter || '';
      equipmentParameterButton.disabled = !equipmentParameter;
    }
    if (controls) renderDecisionControls(controls, decision, state);
  }

  app.renderDecisionOutput = renderDecisionOutput;

  app.initializeDecisionView = function initializeDecisionView(appState) {
    const controls = document.querySelector('[data-decision-controls]');
    const reEvaluate = () => app.recomputeCurrentDecision?.();
    document.querySelector('[data-decision-equipment-parameter]')?.addEventListener('click', (event) => {
      const targetName = event.currentTarget.dataset.parameterTarget;
      if (!targetName) return;
      document.querySelector('[data-dashboard-tab="equipment"]')?.click();
      const row = [...document.querySelectorAll('tr[data-parameter-row]')]
        .find((item) => item.querySelector('td')?.textContent.trim() === targetName);
      if (!row) return;
      row.click();
      row.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
    controls?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-decision-choice]');
      if (!button) return;
      const state = appState.methodDevelopmentState || (appState.methodDevelopmentState = {});
      const temperatureInput = controls.querySelector('[data-custom-temperature-c]');
      const manualSolventInput = controls.querySelector('[data-manual-solvent-percent-b]');
      switch (button.dataset.decisionChoice) {
        case 'another-temperature':
          state.post60Choice = 'ANOTHER_TEMPERATURE';
          app.persistUserState(appState);
          renderDecisionControls(controls, appState.currentRun?.decision, state);
          controls.querySelector('[data-custom-temperature-c]')?.focus();
          return;
        case 'change-solvent':
          state.post60Choice = 'CHANGE_SOLVENT';
          break;
        case 'changed-solvent-yes':
          state.post60Choice = 'YES';
          state.customTemperatureChoice = 'YES';
          app.persistUserState(appState);
          renderDecisionControls(controls, appState.currentRun?.decision, state);
          controls.querySelector('[data-custom-temperature-c]')?.focus();
          return;
        case 'changed-solvent-no':
          state.post60Choice = 'NO';
          break;
        case 'set-custom-temperature':
          if (!temperatureInput?.value) {
            temperatureInput?.focus();
            return;
          }
          state.customTemperatureC = Number(temperatureInput.value);
          state.customTemperatureChoice = 'YES';
          break;
        case 'manual-solvent-percent-b':
          if (manualSolventInput?.value === '' || !Number.isFinite(Number(manualSolventInput.value))
            || Number(manualSolventInput.value) < 0 || Number(manualSolventInput.value) > 100) {
            manualSolventInput?.focus();
            return;
          }
          state.manualSolventPercentB = Number(manualSolventInput.value);
          break;
        default:
          return;
      }
      reEvaluate();
    });
  };
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});