(function (app) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const chartWidth = 1000;
  const chartHeight = 440;
  const plot = { left: 112, right: 976, top: 24, bottom: 376 };
  let activePeakTooltip = null;
  let tooltipDismissListenerAttached = false;

  function svgElement(name, attributes = {}, text = '') {
    const element = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (text) element.textContent = text;
    return element;
  }

  function textElement(text, x, y, className, anchor = 'middle') {
    return svgElement('text', { x, y, class: className, 'text-anchor': anchor }, text);
  }

  function peakTooltipText(peak) {
    return `Peak ${peak.peakNumber}; I.Time ${peak.initialTimeMin ?? 'unavailable'} min; R.Time apex ${peak.retentionTimeMin} min; F.Time ${peak.finalTimeMin ?? 'unavailable'} min; Area ${peak.area}; Height ${peak.height} mAU`;
  }

  function showPeakTooltip(tooltip, panel, event, peak) {
    const peakNumber = String(peak.peakNumber);
    if (activePeakTooltip === tooltip && tooltip.dataset.activePeakNumber === peakNumber) {
      tooltip.hidden = true;
      activePeakTooltip = null;
      return;
    }
    if (activePeakTooltip) activePeakTooltip.hidden = true;
    tooltip.textContent = peakTooltipText(peak);
    tooltip.dataset.activePeakNumber = peakNumber;
    tooltip.hidden = false;
    activePeakTooltip = tooltip;
    const panelBounds = panel.getBoundingClientRect();
    const tooltipBounds = tooltip.getBoundingClientRect();
    const left = event.clientX - panelBounds.left + 12;
    const top = event.clientY - panelBounds.top + 12;
    tooltip.style.left = `${Math.max(8, Math.min(left, panel.clientWidth - tooltipBounds.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(top, panel.clientHeight - tooltipBounds.height - 8))}px`;
  }

  function peakMetric(peak, metric) {
    const directValue = Number(peak?.[metric]);
    if (peak?.[metric] !== null && peak?.[metric] !== undefined && peak?.[metric] !== '' && Number.isFinite(directValue)) {
      return directValue;
    }
    const matchingProperty = Object.entries(peak?.properties || {}).find(([name]) => {
      const normalizedName = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
      if (metric === 'area') return normalizedName === 'area' || /^area\s*\(auc\)$/.test(normalizedName);
      if (metric === 'height') return /^height(?:\s*\(.*\))?$/.test(normalizedName);
      return false;
    });
    if (!matchingProperty) return null;
    const propertyValue = matchingProperty[1];
    const parsedValue = typeof propertyValue === 'number'
      ? propertyValue
      : Number(String(propertyValue).trim().replace(/,/g, ''));
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function peakBoundaryTime(peak, boundary) {
    const directKey = boundary === 'initial' ? 'initialTimeMin' : 'finalTimeMin';
    const directValue = Number(peak?.[directKey]);
    if (peak?.[directKey] !== null && peak?.[directKey] !== undefined && peak?.[directKey] !== '' && Number.isFinite(directValue)) {
      return directValue;
    }
    const aliases = boundary === 'initial'
      ? ['i.time', 'initial time', 'initial time (min)']
      : ['f.time', 'final time', 'final time (min)'];
    const matchingProperty = Object.entries(peak?.properties || {}).find(([name]) => aliases.includes(String(name).trim().toLowerCase().replace(/\s+/g, ' ')));
    if (!matchingProperty) return null;
    const value = matchingProperty[1];
    const parsedValue = typeof value === 'number' ? value : Number(String(value).trim().replace(/,/g, ''));
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function areaValidPeaks(run) {
    return (run?.results?.peaks || []).map((peak) => ({
      ...peak,
      area: peakMetric(peak, 'area'),
      height: peakMetric(peak, 'height'),
      initialTimeMin: peakBoundaryTime(peak, 'initial'),
      finalTimeMin: peakBoundaryTime(peak, 'final')
    })).filter((peak) => Number.isFinite(peak.retentionTimeMin)
      && Number.isFinite(peak.area) && peak.area > 10000);
  }

  function appendRestorePeaksButton(panel, run, appState) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chromatogram-restore-button';
    button.textContent = 'Restore removed peaks';
    button.addEventListener('click', () => {
      run.visualizationRemovedPeakNumbers = [];
      app.persistUserState(appState);
      renderChromatogram(run, appState);
    });
    panel.append(button);
  }

  function clearPanel(message = 'Select a run') {
    const panel = document.querySelector('[data-chromatogram-reconstruction]');
    if (!panel) return;
    panel.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'chromatogram-empty-state';
    empty.textContent = message;
    panel.append(empty);
  }

  function appendRunHeading(panel, run) {
    const heading = document.createElement('p');
    heading.className = 'chromatogram-run-heading';
    const group = String(run.metadata?.groupIdentifier || '—');
    const injection = run.metadata?.injectionRunIdentifier || '—';
    heading.textContent = `Group ${group}, Run ${injection}`;
    panel.append(heading);
  }

  function renderAxes(svg, xMaximum, yMaximum) {
    const plotWidth = plot.right - plot.left;
    const plotHeight = plot.bottom - plot.top;
    let xMajorTicks = '';
    let xMinorTicks = '';
    let xMajorGrid = '';
    for (let minute = 0; minute <= xMaximum + 1e-9; minute += 0.2) {
      const x = plot.left + (minute / xMaximum) * plotWidth;
      const isMajor = Math.abs(minute - Math.round(minute)) < 1e-8;
      if (isMajor) xMajorTicks += `M${x},${plot.bottom}v8 `;
      else xMinorTicks += `M${x},${plot.bottom}v4 `;
      if (isMajor) {
        xMajorGrid += `M${x},${plot.top}V${plot.bottom} `;
        svg.append(textElement(String(Math.round(minute)), x, plot.bottom + 23, 'chromatogram-axis-label'));
      }
    }
    svg.append(svgElement('path', { d: xMajorGrid, class: 'chromatogram-gridline' }));
    svg.append(svgElement('path', { d: xMinorTicks, class: 'chromatogram-tick-minor' }));
    svg.append(svgElement('path', { d: xMajorTicks, class: 'chromatogram-tick-major' }));

    let yMajorTicks = '';
    let yMinorTicks = '';
    let yMajorGrid = '';
    const yMajorInterval = yMaximum >= 1000000 ? 1500000 : 150000;
    const yMinorInterval = yMajorInterval / 5;
    for (let pressure = 0; pressure <= yMaximum; pressure += yMinorInterval) {
      const y = plot.bottom - (pressure / yMaximum) * plotHeight;
      const isMajorTick = pressure % yMajorInterval === 0;
      if (isMajorTick) yMajorTicks += `M${plot.left - 8},${y}H${plot.left} `;
      else yMinorTicks += `M${plot.left - 4},${y}H${plot.left} `;
      if (isMajorTick) {
        yMajorGrid += `M${plot.left},${y}H${plot.right} `;
        svg.append(textElement(String(pressure), plot.left - 13, y + 4, 'chromatogram-axis-label', 'end'));
      }
    }
    svg.append(svgElement('path', { d: yMajorGrid, class: 'chromatogram-gridline' }));
    svg.append(svgElement('path', { d: yMinorTicks, class: 'chromatogram-tick-minor' }));
    svg.append(svgElement('path', { d: yMajorTicks, class: 'chromatogram-tick-major' }));
    svg.append(svgElement('line', { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, class: 'chromatogram-axis' }));
    svg.append(svgElement('line', { x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.bottom, class: 'chromatogram-axis' }));
    svg.append(textElement('Retention time (min)', (plot.left + plot.right) / 2, chartHeight - 10, 'chromatogram-axis-title'));
    const yTitle = textElement('Signal (mAU)', 24, (plot.top + plot.bottom) / 2, 'chromatogram-axis-title');
    yTitle.setAttribute('transform', `rotate(-90 24 ${(plot.top + plot.bottom) / 2})`);
    svg.append(yTitle);
  }

  function peakPath(peak, index, peaks, xMaximum, yMaximum) {
    const plotWidth = plot.right - plot.left;
    const plotHeight = plot.bottom - plot.top;
    const xScale = plotWidth / xMaximum;
    const leftGap = index > 0 ? peak.retentionTimeMin - peaks[index - 1].retentionTimeMin : xMaximum;
    const rightGap = index < peaks.length - 1 ? peaks[index + 1].retentionTimeMin - peak.retentionTimeMin : xMaximum;
    const availableWidth = Math.max(0.04, Math.min(leftGap, rightGap));
    const peakHeight = (peak.height / yMaximum) * plotHeight;
    const fallbackHalfWidth = Math.max(0.025, Math.min(0.12, availableWidth * 0.12));
    let startTime = Number.isFinite(peak.initialTimeMin) ? peak.initialTimeMin : peak.retentionTimeMin - fallbackHalfWidth;
    let endTime = Number.isFinite(peak.finalTimeMin) ? peak.finalTimeMin : peak.retentionTimeMin + fallbackHalfWidth;
    startTime = Math.max(0, Math.min(xMaximum, startTime));
    endTime = Math.max(0, Math.min(xMaximum, endTime));
    if (endTime <= startTime) {
      startTime = Math.max(0, peak.retentionTimeMin - fallbackHalfWidth);
      endTime = Math.min(xMaximum, peak.retentionTimeMin + fallbackHalfWidth);
    }
    const apexTime = Math.max(startTime, Math.min(endTime, peak.retentionTimeMin));
    const xStart = Math.max(plot.left, Math.min(plot.right, plot.left + (startTime / xMaximum) * plotWidth));
    const xApex = Math.max(plot.left, Math.min(plot.right, plot.left + (apexTime / xMaximum) * plotWidth));
    const xEnd = Math.max(plot.left, Math.min(plot.right, plot.left + (endTime / xMaximum) * plotWidth));
    const apexY = Math.max(plot.top, Math.min(plot.bottom, plot.bottom - peakHeight));
    const riseWidth = xApex - xStart;
    const fallWidth = xEnd - xApex;
    const riseControlStart = xStart + riseWidth * 0.4;
    const riseControlApex = xApex - riseWidth * 0.23;
    const fallControlApex = xApex + fallWidth * 0.23;
    const fallControlEnd = xEnd - fallWidth * 0.4;
    const format = (value) => value.toFixed(2);
    return `M${format(xStart)},${plot.bottom} C${format(riseControlStart)},${plot.bottom} ${format(riseControlApex)},${format(apexY)} ${format(xApex)},${format(apexY)} C${format(fallControlApex)},${format(apexY)} ${format(fallControlEnd)},${plot.bottom} ${format(xEnd)},${plot.bottom}`;
  }

  function renderChromatogram(run, appState) {
    const panel = document.querySelector('[data-chromatogram-reconstruction]');
    if (!panel) return;
    if (activePeakTooltip) activePeakTooltip.hidden = true;
    activePeakTooltip = null;
    panel.replaceChildren();
    if (!run) {
      clearPanel();
      return;
    }
    appState.visualChromatogramRunId = run.id;
    appendRunHeading(panel, run);
    const areaValid = areaValidPeaks(run);
    const removedPeakNumbers = new Set(run.visualizationRemovedPeakNumbers || []);
    const remainingAreaValid = areaValid.filter((peak) => !removedPeakNumbers.has(peak.peakNumber));
    const peaks = remainingAreaValid.filter((peak) => Number.isFinite(peak.height) && peak.height >= 0)
      .sort((first, second) => first.retentionTimeMin - second.retentionTimeMin);
    if (!remainingAreaValid.length) {
      const message = document.createElement('p');
      message.className = 'chromatogram-empty-state';
        const peakRecords = run.results?.peaks || [];
        const missingAreaCount = peakRecords.filter((peak) => peakMetric(peak, 'area') === null).length;
        const excludedAreaCount = run.results?.excludedArtifactPeaks?.length || 0;
        message.textContent = areaValid.length && removedPeakNumbers.size
          ? 'All Area-valid peaks are currently hidden from this visualization. The saved chromatographic results are unchanged.'
          : missingAreaCount === peakRecords.length && peakRecords.length
            ? 'Area data is missing from the saved peak records, so peak validity cannot be checked for reconstruction.'
            : excludedAreaCount && !areaValid.length
              ? `No peaks meet the Area > 10,000 criterion; ${excludedAreaCount} peak${excludedAreaCount === 1 ? ' was' : 's were'} excluded by Area.`
              : peakRecords.length
                ? 'No peaks with Area above 10,000 are available for reconstruction.'
                : 'This run has no peak records available for reconstruction.';
      panel.append(message);
      if (areaValid.length && removedPeakNumbers.size) appendRestorePeaksButton(panel, run, appState);
      return;
    }
    const missingHeightCount = remainingAreaValid.filter((peak) => peakMetric(peak, 'height') === null).length;
    if (missingHeightCount) {
      const warning = document.createElement('p');
      warning.className = 'chromatogram-data-warning';
      warning.textContent = `${missingHeightCount} Area-valid peak${missingHeightCount === 1 ? '' : 's'} ${missingHeightCount === 1 ? 'has' : 'have'} no valid Height value and cannot be plotted.`;
      panel.append(warning);
    }
    if (!peaks.length) return;

    const lastRetentionTime = Math.max(
      Number.isFinite(run.results?.lastPeakRetentionTimeMin) ? run.results.lastPeakRetentionTimeMin : 0,
      ...peaks.map((peak) => peak.retentionTimeMin)
    );
    const xMaximum = Math.max(1, Math.ceil(lastRetentionTime + 2));
    const maximumHeight = Math.max(0, ...peaks.map((peak) => peak.height));
    const yMajorInterval = maximumHeight >= 1000000 ? 1500000 : 150000;
    const yMaximum = Math.max(yMajorInterval, Math.ceil(maximumHeight / yMajorInterval) * yMajorInterval);
    const svg = svgElement('svg', {
      class: 'chromatogram-svg',
      viewBox: `0 0 ${chartWidth} ${chartHeight}`,
      role: 'img',
      'aria-label': `Visual reconstruction for group ${run.metadata?.groupIdentifier || 'unknown'}, run ${run.metadata?.injectionRunIdentifier || 'unknown'}; ${peaks.length} plotted peaks`
    });
    renderAxes(svg, xMaximum, yMaximum);
    peaks.forEach((peak, index) => {
      const group = svgElement('g', {
        class: 'chromatogram-peak',
        tabindex: '0',
        role: 'button',
        'aria-label': `Peak ${peak.peakNumber}: ${peak.retentionTimeMin} minutes, ${peak.height} mAU. Click for details. Press Enter or Space to remove from this visualization.`,
        'data-visualization-peak': peak.peakNumber
      });
      group.append(svgElement('path', { d: peakPath(peak, index, peaks, xMaximum, yMaximum), class: 'chromatogram-peak-shape' }));
      const centerX = plot.left + (peak.retentionTimeMin / xMaximum) * (plot.right - plot.left);
      const apexY = plot.bottom - (peak.height / yMaximum) * (plot.bottom - plot.top);
      group.append(svgElement('circle', { cx: centerX, cy: apexY, r: 12, class: 'chromatogram-peak-hit' }));
      const title = svgElement('title', {}, peakTooltipText(peak));
      group.append(title);
      svg.append(group);
    });
    panel.append(svg);
    const tooltip = document.createElement('div');
    tooltip.className = 'chromatogram-peak-tooltip';
    tooltip.id = 'chromatogram-peak-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    panel.append(tooltip);
    if (!tooltipDismissListenerAttached) {
      document.addEventListener('click', (event) => {
        if (!activePeakTooltip || event.target.closest?.('[data-visualization-peak]')) return;
        activePeakTooltip.hidden = true;
        activePeakTooltip = null;
      });
      tooltipDismissListenerAttached = true;
    }
    panel.querySelectorAll('[data-visualization-peak]').forEach((peakNode) => {
      const peak = peaks.find((item) => item.peakNumber === Number(peakNode.dataset.visualizationPeak));
      peakNode.setAttribute('aria-describedby', tooltip.id);
      peakNode.addEventListener('click', (event) => showPeakTooltip(tooltip, panel, event, peak));
      peakNode.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        removeVisualPeak(run, Number(peakNode.dataset.visualizationPeak), appState);
      });
    });
  }

  function removeVisualPeak(run, peakNumber, appState) {
    const removed = new Set(run.visualizationRemovedPeakNumbers || []);
    removed.add(peakNumber);
    run.visualizationRemovedPeakNumbers = [...removed];
    app.persistUserState(appState);
    renderChromatogram(run, appState);
  }

  app.renderChromatogram = renderChromatogram;
  app.clearChromatogram = clearPanel;
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});