(function (app) {
  const isoeluotropicAcNToMeOH = new Map([
    [10, 15], [20, 28], [30, 40], [40, 50], [50, 60],
    [60, 70], [70, 78], [80, 86], [90, 95], [100, 100]
  ]);
  const conditionKeys = [
    'ligand', 'beadType', 'coreshellPresent',
    'columnLengthMm', 'columnInternalDiameterMm', 'particleSizeUm', 'solventType',
    'flowRateMlMin', 'sampleConcentrationMgMl', 'temperatureC', 'wavelengthNm', 'pH'
  ];

  function number(value) {
    const parsed = Number(value);
    return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : null;
  }

  function wholePsi(value) {
    const parsed = number(value);
    return parsed === null ? '—' : String(Math.round(parsed));
  }

  function qualitativeStatusSummary(run, specifications) {
    const results = run?.results || {};
    const measuredBackpressure = number(results.backPressurePsi);
    const maximumBackpressure = number(specifications?.maximumBackpressurePsi);
    const measuredPeakCount = number(results.peakCount);
    const declaredPeakCount = number(results.declaredPeakCount);
    const targetPeakCount = number(specifications?.targetPeakCount);
    const lastPeakTime = number(results.lastPeakRetentionTimeMin);
    const maximumRunTime = number(specifications?.maximumRunTimeMin);
    const worstResolution = number(results.worstPairResolution);
    const resolutionSpecification = number(specifications?.minimumResolutionRmin);
    const observedPeakCount = measuredPeakCount ?? declaredPeakCount;
    const hasExcessPeaks = targetPeakCount !== null && observedPeakCount !== null
      && Math.max(measuredPeakCount ?? 0, declaredPeakCount ?? 0) > targetPeakCount;
    const backpressureFailed = measuredBackpressure !== null && maximumBackpressure !== null
      && measuredBackpressure > maximumBackpressure;
    const backpressureText = measuredBackpressure === null || maximumBackpressure === null
      ? 'Backpressure could not be assessed'
      : backpressureFailed ? 'Backpressure is outside the specification' : 'Backpressure is within the specification';

    if (measuredBackpressure === null || maximumBackpressure === null || measuredBackpressure < 0) {
      return `${backpressureText}; peak count, tR, and resolution were not assessed.`;
    }
    if (backpressureFailed) return `${backpressureText}; peak count, tR, and resolution were not assessed.`;

    const peakCountText = observedPeakCount === null || targetPeakCount === null
      ? 'peak count could not be assessed'
      : hasExcessPeaks ? 'peak count is above the specification'
        : observedPeakCount === targetPeakCount ? 'peak count meets the specification'
          : 'peak count is below the specification';
    if (observedPeakCount === null || !Number.isInteger(observedPeakCount) || hasExcessPeaks) {
      return `${backpressureText}; ${peakCountText}; tR and resolution were not assessed.`;
    }
    const percentB = number(run?.conditions?.percentB);
    if (percentB === null || percentB < 0 || percentB > 100) {
      return `${backpressureText}; ${peakCountText}; tR and resolution were not assessed because %B is unavailable or invalid.`;
    }

    const retentionText = lastPeakTime === null || maximumRunTime === null
      ? 'tR could not be assessed'
      : lastPeakTime > maximumRunTime ? 'tR is above the specification' : 'tR is within the specification';
    const resolutionText = worstResolution === null || resolutionSpecification === null
      ? 'resolution could not be assessed'
      : worstResolution < resolutionSpecification ? 'resolution is below the specification'
        : worstResolution > resolutionSpecification ? 'resolution is above the specification'
          : 'resolution meets the specification';
    return `${backpressureText}; ${peakCountText}; ${retentionText}; ${resolutionText}.`;
  }

  function normalized(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function sameValue(first, second) {
    const firstNumber = number(first);
    const secondNumber = number(second);
    if (firstNumber !== null && secondNumber !== null) return firstNumber === secondNumber;
    return normalized(first) === normalized(second);
  }

  function sameRetentionSystem(first, second) {
    return conditionKeys.every((key) => sameValue(first?.conditions?.[key], second?.conditions?.[key]));
  }

  function sameLigand(first, second) {
    return normalized(first?.conditions?.ligand) === normalized(second?.conditions?.ligand);
  }

  function sameGroup(first, second) {
    const firstGroup = normalized(first?.metadata?.groupIdentifier).replace(/^gr/i, '').replace(/^0+(?=\d)/, '');
    const secondGroup = normalized(second?.metadata?.groupIdentifier).replace(/^gr/i, '').replace(/^0+(?=\d)/, '');
    return firstGroup === secondGroup;
  }

  function hasRetentionRunAtPercentB(history, run, percentB) {
    if (number(run?.conditions?.percentB) === percentB) return true;
    return history.some((candidate) => candidate.id !== run?.id
      && sameGroup(candidate, run)
      && sameRetentionSystem(candidate, run)
      && number(candidate.conditions?.percentB) === percentB
      && String(candidate.decision?.cycle || '').startsWith('RETENTION'));
  }

  function sameRetentionChemistry(first, second) {
    return conditionKeys.filter((key) => key !== 'temperatureC')
      .every((key) => sameValue(first?.conditions?.[key], second?.conditions?.[key]));
  }

  function sameRetentionSetup(first, second) {
    return conditionKeys.filter((key) => !['solventType', 'temperatureC'].includes(key))
      .every((key) => sameValue(first?.conditions?.[key], second?.conditions?.[key]));
  }

  function sameSelectivitySetup(first, second) {
    return conditionKeys.filter((key) => !['solventType', 'temperatureC'].includes(key))
      .every((key) => sameValue(first?.conditions?.[key], second?.conditions?.[key]));
  }

  function retentionSolventForRun(history, run) {
    const retentionRuns = history.filter((candidate) => sameGroup(candidate, run)
      && sameLigand(candidate, run)
      && String(candidate.decision?.cycle || '').startsWith('RETENTION'));
    if (!retentionRuns.length) return null;
    const solvents = new Set(retentionRuns.map((candidate) => normalized(candidate.conditions?.solventType)).filter(Boolean));
    if (solvents.size !== 1) return '';
    return String(retentionRuns.find((candidate) => normalized(candidate.conditions?.solventType))?.conditions?.solventType || '');
  }

  function hasPriorSelectivityTemperatureAtPercentB(history, run, temperatureC) {
    const currentB = number(run?.conditions?.percentB);
    return history.some((candidate) => candidate.id !== run?.id
      && sameGroup(candidate, run)
      && sameLigand(candidate, run)
      && sameSelectivitySetup(candidate, run)
      && sameValue(candidate.conditions?.solventType, run?.conditions?.solventType)
      && number(candidate.conditions?.temperatureC) === temperatureC
      && currentB !== null
      && number(candidate.conditions?.percentB) === currentB);
  }

  function isMinimumBRun(history, run, calculatedMinimumB) {
    const currentB = number(run?.conditions?.percentB);
    const priorSameSystem = history.filter((candidate) => sameRetentionSystem(candidate, run));
    const latestPriorRun = priorSameSystem[priorSameSystem.length - 1];
    const latestPriorNextConditions = latestPriorRun?.decision?.nextConditions;
    const pendingMinimumRecommendation = number(latestPriorNextConditions?.minimumPercentB) !== null
      || /minimum\s*%b/i.test(String(latestPriorRun?.decision?.action || ''))
      ? latestPriorRun
      : null;
    const recommendedMinimumB = number(pendingMinimumRecommendation?.decision?.nextConditions?.minimumPercentB)
      ?? number(pendingMinimumRecommendation?.decision?.minimumPercentB);
    const priorPercentB = [...priorSameSystem].reverse()
      .map((candidate) => number(candidate.conditions?.percentB))
      .find((percentB) => percentB !== null);
    const isStandardTenPointDecrease = priorPercentB !== null && currentB === priorPercentB - 10;
    const minimumBMatchTarget = recommendedMinimumB ?? calculatedMinimumB;
    const withinRecommendedMinimumTolerance = minimumBMatchTarget !== null
      && currentB !== null
      && Math.abs(currentB - minimumBMatchTarget) <= 4;
    const minimumWasRecommended = Boolean(pendingMinimumRecommendation)
      && withinRecommendedMinimumTolerance
      && !isStandardTenPointDecrease;
    const matchesPriorMinimumRecommendation = currentB !== null && history.some((candidate) => {
      if (!sameGroup(candidate, run) || !sameRetentionChemistry(candidate, run)) return false;
      const recommendedB = number(candidate.decision?.nextConditions?.minimumPercentB)
        ?? (/minimum\s*%b/i.test(String(candidate.decision?.action || ''))
          ? number(candidate.decision?.minimumPercentB)
          : null);
      return recommendedB !== null && currentB === recommendedB;
    });
    return calculatedMinimumB !== null && currentB === calculatedMinimumB
      || recommendedMinimumB !== null && currentB === recommendedMinimumB
      || minimumWasRecommended
      || matchesPriorMinimumRecommendation;
  }

  function priorCompletedMinimumRun(history, run) {
    return [...history].reverse().find((candidate) => {
      if (!sameGroup(candidate, run) || !sameLigand(candidate, run) || !sameRetentionChemistry(candidate, run)) return false;
      if (candidate.decision?.minBRunEvaluated === true) return true;
      const candidateB = number(candidate.conditions?.percentB);
      const calculatedB = number(candidate.decision?.minimumPercentB);
      return String(candidate.decision?.cycle || '').startsWith('RETENTION')
        && candidate.decision?.status === 'OBSERVE'
        && candidateB !== null && calculatedB !== null
        && Math.abs(candidateB - calculatedB) <= 4;
    }) || null;
  }

  function priorSelectivityRecommendation(history, run) {
    return [...history].reverse().find((candidate) => sameGroup(candidate, run)
      && sameLigand(candidate, run)
      && sameRetentionChemistry(candidate, run)
      && (candidate.decision?.interaction?.type === 'selectivity-optimal-percent-b'
        || /Proceed to Selectivity using the optimal %B composition from Retention/i.test(String(candidate.decision?.action || '')))) || null;
  }

  function isAmbientIntermediateRunAfterMinimum(history, run, minimumRun) {
    if (!minimumRun || !/^amb(?:ient)?(?:\b|\s|\()/i.test(String(run?.conditions?.temperatureDisplay || ''))) return false;
    const percentB = number(run?.conditions?.percentB);
    if (percentB === null || percentB % 10 === 0) return false;
    const priorRetentionB = history.filter((candidate) => candidate.id !== run.id
      && sameGroup(candidate, run)
      && sameLigand(candidate, run)
      && sameRetentionChemistry(candidate, run)
      && String(candidate.decision?.cycle || '').startsWith('RETENTION'))
      .map((candidate) => number(candidate.conditions?.percentB))
      .filter((value) => value !== null && value !== percentB);
    return priorRetentionB.some((lower) => lower < percentB && priorRetentionB.some((upper) => upper > percentB));
  }

  function retentionSeries(history, currentRun) {
    const uniqueRuns = [];
    const seenRunIds = new Set();
    for (const run of history) {
      const runId = run?.id;
      if (runId && seenRunIds.has(runId)) continue;
      if (runId) seenRunIds.add(runId);
      uniqueRuns.push(run);
    }
    const sameLigandRuns = uniqueRuns.filter((run) => sameLigand(run, currentRun));
    const labelledRetentionRuns = sameLigandRuns.filter((run) => String(run.decision?.cycle || '').startsWith('RETENTION'));
    const candidates = labelledRetentionRuns.length ? labelledRetentionRuns : sameLigandRuns.filter((run) => !run.decision);
    const sameSolvent = candidates.filter((run) => sameValue(run.conditions?.solventType, currentRun.conditions?.solventType));
    const reference = sameSolvent[sameSolvent.length - 1] || candidates[candidates.length - 1] || currentRun;
    const series = candidates.filter((run) => sameRetentionSystem(run, reference));
    if (sameRetentionSystem(currentRun, reference)
      && (!currentRun.id || !series.some((run) => run.id === currentRun.id))) series.push(currentRun);
    return { reference, runs: series };
  }

  function regression(points) {
    if (points.length < 2) return null;
    const meanX = points.reduce((sum, point) => sum + point.percentB, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.logK, 0) / points.length;
    const varianceX = points.reduce((sum, point) => sum + (point.percentB - meanX) ** 2, 0);
    const varianceY = points.reduce((sum, point) => sum + (point.logK - meanY) ** 2, 0);
    if (varianceX === 0 || varianceY === 0) return null;
    const covariance = points.reduce((sum, point) => sum + (point.percentB - meanX) * (point.logK - meanY), 0);
    const slope = covariance / varianceX;
    const intercept = meanY - slope * meanX;
    const rSquared = (covariance ** 2) / (varianceX * varianceY);
    return { slope, intercept, rSquared };
  }

  function combinations(items, count, start = 0, selected = [], output = []) {
    if (selected.length === count) {
      output.push([...selected]);
      return output;
    }
    for (let index = start; index <= items.length - (count - selected.length); index += 1) {
      selected.push(items[index]);
      combinations(items, count, index + 1, selected, output);
      selected.pop();
    }
    return output;
  }

  function bestRegressionSubset(points) {
    for (let count = points.length; count >= 2; count -= 1) {
      let best = null;
      for (const subset of combinations(points, count)) {
        const fit = regression(subset);
        if (!fit || fit.slope >= 0 || fit.rSquared < 0.99) continue;
        const without80 = subset.filter((point) => point.percentB !== 80);
        if (subset.some((point) => point.percentB === 80)) {
          if (without80.length < 2) continue;
          const comparison = regression(without80);
          if (!comparison || fit.rSquared < comparison.rSquared) continue;
        }
        if (!best || fit.rSquared > best.fit.rSquared) best = { points: subset, fit };
      }
      if (best) return best;
    }
    return null;
  }

  function calculateMinimumPercentB(history, currentRun, specifications) {
    const requiredSystemValues = ['ligand', 'solventType', 'temperatureC'];
    const missingSystemValues = requiredSystemValues.filter((key) => {
      const value = currentRun?.conditions?.[key];
      return value === null || value === undefined || value === '';
    });
    if (missingSystemValues.length) {
      return {
        status: 'INSUFFICIENT_DATA',
        sufficientData: false,
        minimumPercentB: null,
        points: [],
        reason: `Min %B requires matching ligand, solvent, and temperature data; missing ${missingSystemValues.join(', ')}.`
      };
    }
    const { runs: matchedRuns } = retentionSeries(history, currentRun);
    const points = matchedRuns.flatMap((run) => {
      const percentB = number(run.conditions?.percentB);
      const backPressure = number(run.results?.backPressurePsi);
      const runBackPressureLimit = number(run.methodSpecifications?.maximumBackpressurePsi)
        ?? number(specifications?.maximumBackpressurePsi);
      const peakCount = number(run.results?.peakCount);
      const declaredPeakCount = number(run.results?.declaredPeakCount);
      const peaks = run.results?.peaks || [];
      const deadTime = number(peaks[0]?.retentionTimeMin);
      const lastRetention = number(run.results?.lastPeakRetentionTimeMin);
      if (percentB === null || percentB < 30 || percentB > 100 || percentB === 90 || percentB === 100
        || percentB % 10 !== 0
        || run.decision?.minBRunEvaluated === true
        || run.decision?.intermediateBRunEvaluated === true
        || backPressure === null || runBackPressureLimit === null || backPressure > runBackPressureLimit
        || peakCount === null || peakCount > specifications.targetPeakCount
        || declaredPeakCount !== null && declaredPeakCount > specifications.targetPeakCount
        || deadTime === null || deadTime <= 0 || lastRetention === null) return [];
      const retentionFactor = (lastRetention - deadTime) / deadTime;
      if (retentionFactor <= 0) return [];
      return [{ runId: run.id, percentB, deadTime, lastRetention, retentionFactor, logK: Math.log10(retentionFactor) }];
    });

    if (points.length < 2) {
      return {
        status: 'INSUFFICIENT_DATA',
        sufficientData: false,
        minimumPercentB: null,
        points,
        reason: `At least two valid Retention runs on the same ligand/system are required; ${points.length} are available.`
      };
    }

    const selected = bestRegressionSubset(points);
    if (!selected) {
      return {
        status: 'INSUFFICIENT_DATA',
        sufficientData: false,
        minimumPercentB: null,
        points,
        reason: 'No eligible combination of Retention runs produces a decreasing log10(K)-versus-%B fit with R-squared at least 0.99.'
      };
    }

    const averageDeadTime = selected.points.reduce((sum, point) => sum + point.deadTime, 0) / selected.points.length;
    const maximumRunTime = number(specifications?.maximumRunTimeMin);
    const targetK = maximumRunTime === null ? null : (maximumRunTime - averageDeadTime) / averageDeadTime;
    if (targetK === null || targetK <= 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        sufficientData: false,
        minimumPercentB: null,
        points: selected.points,
        fit: selected.fit,
        reason: 'The maximum run-time specification and average dead time do not produce a positive target K.'
      };
    }

    const calculated = (Math.log10(targetK) - selected.fit.intercept) / selected.fit.slope;
    if (!Number.isFinite(calculated) || calculated < 0 || calculated > 100) {
      return {
        status: 'INSUFFICIENT_DATA',
        sufficientData: false,
        minimumPercentB: null,
        points: selected.points,
        fit: selected.fit,
        averageDeadTime,
        targetK,
        reason: 'The fitted relationship predicts a minimum %B outside the permitted 0-100% range.'
      };
    }

    return {
      status: 'CALCULATED',
      sufficientData: true,
      minimumPercentB: Math.ceil(calculated),
      unroundedPercentB: calculated,
      points: selected.points,
      fit: selected.fit,
      averageDeadTime,
      targetK,
      targetLogK: Math.log10(targetK),
      reason: `Min %B is calculated from ${selected.points.length} valid runs (R-squared ${selected.fit.rSquared.toFixed(4)}), using average t0 ${averageDeadTime.toFixed(3)} min.`
    };
  }

  function convertIsoeluotropicPercentB(solvent, percentB) {
    const value = number(percentB);
    if (value === null) return { status: 'INSUFFICIENT_DATA', percentB: null };
    const solventName = normalized(solvent).replace(/\s/g, '');
    const convertingFromAcN = solventName === 'acn' || solventName === 'acetonitrile';
    const convertingFromMeOH = solventName === 'meoh' || solventName === 'methanol';
    if (!convertingFromAcN && !convertingFromMeOH) return { status: 'NOT_CONFIGURED', percentB: null };

    const anchors = [...isoeluotropicAcNToMeOH].map(([acnPercentB, meohPercentB]) => convertingFromAcN
      ? { source: acnPercentB, target: meohPercentB }
      : { source: meohPercentB, target: acnPercentB })
      .sort((first, second) => first.source - second.source);
    const targetSolvent = convertingFromAcN ? 'MeOH' : 'ACN';
    const exact = anchors.find((anchor) => anchor.source === value);
    if (exact) return { status: 'CALCULATED', percentB: exact.target, solventType: targetSolvent, interpolated: false };

    for (let index = 0; index < anchors.length - 1; index += 1) {
      const lower = anchors[index];
      const upper = anchors[index + 1];
      if (value <= lower.source || value >= upper.source) continue;
      const fraction = (value - lower.source) / (upper.source - lower.source);
      const interpolatedValue = lower.target + fraction * (upper.target - lower.target);
      const roundedPercentB = Math.round(interpolatedValue * 100) / 100;
      return { status: 'CALCULATED', percentB: roundedPercentB, solventType: targetSolvent, interpolated: true };
    }

    return { status: 'NOT_CONFIGURED', percentB: null };
  }

  function recommendationMatches(run, recommendation) {
    if (!recommendation || !run?.conditions) return false;
    const expected = recommendation.conditions || recommendation;
    return ['ligand', 'solventType', 'percentB', 'temperatureC'].every((key) => {
      const currentValue = run.conditions[key];
      const expectedValue = expected[key];
      return expectedValue === undefined || sameValue(currentValue, expectedValue);
    });
  }

  function sameTestedCondition(first, second, includePercentB = true) {
    const keys = [...conditionKeys, ...(includePercentB ? ['percentB'] : [])];
    return keys.every((key) => sameValue(first?.conditions?.[key], second?.conditions?.[key]));
  }

  function getPriorDecision(history, run) {
    return [...history].reverse().find((candidate) => sameGroup(candidate, run)
      && recommendationMatches(run, candidate.decision?.nextConditions));
  }

  function bestRetentionRun(history, currentRun, specifications, excludeCurrent = false) {
    const { runs } = retentionSeries(history, currentRun);
    const candidates = runs.filter((run) => (!excludeCurrent || !currentRun?.id || run.id !== currentRun.id)
      && number(run.results?.backPressurePsi) !== null
      && number(run.results.backPressurePsi) <= specifications.maximumBackpressurePsi
      && number(run.results?.lastPeakRetentionTimeMin) !== null
      && run.results.lastPeakRetentionTimeMin <= specifications.maximumRunTimeMin
      && number(run.results?.peakCount) !== null
      && run.results.peakCount <= specifications.targetPeakCount
      && (number(run.results?.declaredPeakCount) === null || run.results.declaredPeakCount <= specifications.targetPeakCount)
      && number(run.results?.worstPairResolution) !== null);
    candidates.sort((first, second) => {
      const peaksDifference = number(second.results?.peakCount) - number(first.results?.peakCount);
      if (peaksDifference) return peaksDifference;
      const timeDifference = number(first.results?.lastPeakRetentionTimeMin) - number(second.results?.lastPeakRetentionTimeMin);
      if (timeDifference) return timeDifference;
      const firstResolution = number(first.results?.worstPairResolution) ?? -Infinity;
      const secondResolution = number(second.results?.worstPairResolution) ?? -Infinity;
      return secondResolution - firstResolution;
    });
    return candidates[0] || null;
  }

  function baseDecision(run, status, stage, action, reason, specifications) {
    return {
      status,
      cycle: stage,
      stage,
      action,
      reason,
      evidence: [],
      changedParameter: null,
      currentConditions: { ...(run.conditions || {}) },
      nextConditions: { ...(run.conditions || {}) },
      nextStage: stage,
      equipmentAction: null,
      methodSpecifications: { ...specifications }
    };
  }

  function setChange(decision, parameter, module, value, units, effect) {
    decision.changedParameter = parameter;
    decision.equipmentAction = {
      parameter,
      controllingModule: module,
      currentValue: decision.currentConditions[({ '%B': 'percentB', 'Temperature': 'temperatureC', 'Solvent type': 'solventType', 'Flow rate': 'flowRateMlMin', 'Column length': 'columnLengthMm', 'Particle size': 'particleSizeUm' })[parameter]] ?? null,
      recommendedValue: value,
      units: units || null,
      minimum: null,
      maximum: null,
      range: 'Not configured',
      effect: effect || ''
    };
  }

  function nextAtCurrentConditions(decision, stage) {
    decision.nextStage = stage;
    decision.nextConditions = { ...(decision.currentConditions || {}) };
    return decision;
  }

  function setSelectivityStartingTemperature(decision) {
    decision.nextConditions.temperatureC = 40;
    decision.nextConditions.displayOverrides = {
      ...(decision.nextConditions.displayOverrides || {}),
      temperatureC: '40°C'
    };
    setChange(decision, 'Temperature', 'Column Oven', '40', '°C', 'Begin the first Selectivity run at 40°C, keeping the other selected conditions unchanged.');
    return decision;
  }

  function setIntermediateOrSelectivityOptions(decision, run) {
    const currentTemperature = number(run?.conditions?.temperatureC) ?? 25;
    decision.changedParameter = 'Temperature OR %B';
    decision.nextConditions.temperatureC = 40;
    decision.nextConditions.percentB = null;
    decision.nextConditions.displayOverrides = {
      ...(decision.nextConditions.displayOverrides || {}),
      percentB: 'chosen int%B (IF choosing int%B)',
      temperatureC: '40°C (if choosing Selectivity)'
    };
    decision.equipmentAction = {
      parameter: 'Temperature OR %B',
      controllingModule: 'Column oven OR Solvents',
      currentValue: `${currentTemperature} °C`,
      recommendedValue: '40 °C OR int.%B',
      units: null,
      minimum: null,
      maximum: null,
      range: '°C between amb (25°C) and 60°C for temp OR 0-100%B (solvents)',
      effect: 'Choose an intermediate %B to investigate peak separation, or proceed to Selectivity with the visually selected optimal %B at 40°C.'
    };
    return decision;
  }

  function timeResolutionDecision(run, specifications, stage, history, state) {
    const results = run.results || {};
    const retention = number(results.lastPeakRetentionTimeMin);
    const resolution = number(results.worstPairResolution);
    const maximumTime = number(specifications.maximumRunTimeMin);
    const resolutionSpec = number(specifications.minimumResolutionRmin);
    const resolutionFloor = resolutionSpec === null ? null : resolutionSpec - 0.4;
    const decision = baseDecision(run, 'EFFICIENCY_REQUIRED', stage, '', '', specifications);
    decision.evidence.push(`Back-pressure ${wholePsi(results.backPressurePsi)} psi is within the ${wholePsi(specifications.maximumBackpressurePsi)} psi limit.`, `${results.peakCount} peaks meet the target of ${specifications.targetPeakCount}.`);
    if (retention === null || maximumTime === null || resolution === null || resolutionSpec === null) {
      decision.status = 'INSUFFICIENT_DATA';
      decision.action = 'Required run-time or resolution result is unavailable.';
      decision.reason = 'The last-peak retention time, worst-pair resolution, and active specifications are required to assess tR and Resolution.';
      decision.missingData = [retention === null ? 'last-peak retention time' : null, resolution === null ? 'worst-pair resolution' : null].filter(Boolean);
      return nextAtCurrentConditions(decision, stage);
    }

    const timeClass = retention > maximumTime
      ? 'above'
      : retention < maximumTime - 3 ? 'well-below' : 'below';
    const resolutionClass = resolution >= resolutionSpec
      ? 'meets'
      : resolution > resolutionFloor ? 'near-below' : 'well-below';
    const timePhrase = timeClass === 'well-below' ? 'tR << specification' : timeClass === 'below' ? 'tR < specification' : 'tR > specification';
    const resolutionPhrase = resolutionClass === 'well-below' ? 'R << specification' : resolutionClass === 'near-below' ? 'R < specification' : 'R ≥ specification';
    decision.evidence.push(`tR (last peak) ${retention} min; maximum ${maximumTime} min (${timePhrase}).`, `Worst-pair resolution ${resolution} Rmin; specification ${resolutionSpec} Rmin (${resolutionPhrase}); Rfloor for this workflow is ${resolutionFloor} Rmin.`);
    decision.reason = `As tR (last peak) is ${timePhrase} and resolution is ${resolutionPhrase}, follow the recommended next step.`;

    if ((timeClass === 'well-below' || timeClass === 'below') && resolutionClass === 'meets') {
      decision.status = 'METHOD_REQUIREMENTS_MET';
      decision.action = 'All specifications met!\nNow optimise Efficiency by increasing flow rate to shorten run time.';
      decision.efficiencyObjective = 'SHORTEN_RUN_TIME';
      decision.reason += '\nAll specifications met!\nNow optimise Efficiency by increasing flow rate to shorten run time.';
      decision.changedParameter = 'Flow rate';
      decision.nextConditions.flowRateMlMin = 'Increase';
      decision.nextConditions.displayOverrides = { flowRateMlMin: 'Increase' };
      setChange(decision, 'Flow rate', 'Pump', 'Increase', 'mL/min', 'Increasing flow rate shortens run time; monitor back-pressure.');
      decision.cycle = 'EFFICIENCY';
      decision.stage = 'EFFICIENCY';
      decision.nextStage = 'EFFICIENCY_HANDOFF';
      return decision;
    }

    if (timeClass === 'well-below' && resolutionClass === 'well-below') {
      decision.action = 'Proceed to Efficiency; increase column length. Note, while this may increase efficiency/resolution, run time and backpressure may also increase, thus Backpressure is crucial to consider.';
      decision.efficiencyObjective = 'INCREASE_RESOLUTION';
      decision.changedParameter = 'Column length';
      setChange(decision, 'Column length', 'Column', 'Increase', 'mm', 'A longer column can improve efficiency/resolution but can increase run time and back-pressure.');
      decision.nextConditions.displayOverrides = { columnLengthMm: 'Increase column length' };
      decision.cycle = 'EFFICIENCY';
      decision.stage = 'EFFICIENCY';
      decision.nextStage = 'EFFICIENCY_HANDOFF';
      return decision;
    }
    if (timeClass === 'well-below' && resolutionClass === 'near-below') {
      decision.action = 'Since tR << spec and R < spec, proceed to Efficiency; increase column length (must consider influence on backpressure), OR decrease flow rate, OR decrease particle size (must consider influence on backpressure), OR use SPP/Coreshell.';
      decision.efficiencyObjective = 'INCREASE_RESOLUTION';
      decision.changedParameter = 'Efficiency options';
      decision.nextConditions.flowRateMlMin = 'Decrease';
      decision.nextConditions.displayOverrides = { columnLengthMm: 'Increase column length', flowRateMlMin: 'Decrease', particleSizeUm: 'Decrease particle size; or implement SPP/Coreshell' };
      setChange(decision, 'Efficiency options', 'Pump / Column', 'Increase length; decrease flow/particle size; or implement SPP/Coreshell', null, 'Balance resolution improvement against run time and back-pressure.');
      decision.cycle = 'EFFICIENCY';
      decision.stage = 'EFFICIENCY';
      decision.nextStage = 'EFFICIENCY_HANDOFF';
      return decision;
    }
    if ((timeClass === 'below' || timeClass === 'above') && resolutionClass === 'well-below') {
      const selectivity = selectivityDecision(run, history, specifications, {
        ...state,
        stage: 'SELECTIVITY',
        retentionObserveChoice: 'SELECTIVITY',
        selectedPercentB: number(run.conditions?.percentB),
        startingSolvent: state?.startingSolvent || run.conditions?.solventType,
        startingTemperatureC: state?.startingTemperatureC ?? run.conditions?.temperatureC
      });
      selectivity.reason = `${decision.reason} ${selectivity.reason || ''}`.trim();
      selectivity.evidence = [...decision.evidence, ...(selectivity.evidence || [])];
      selectivity.selectivityStartingPercentB = run.conditions?.percentB;
      return selectivity;
    }
    if (timeClass === 'below' && resolutionClass === 'near-below') {
      decision.action = 'Proceed to Efficiency; decrease particle size (must consider influence on backpressure), OR use SPP/Coreshell.';
      decision.efficiencyObjective = 'INCREASE_RESOLUTION';
      decision.changedParameter = 'Efficiency options';
      decision.nextConditions.displayOverrides = { particleSizeUm: 'Decrease particle size; or implement SPP/Coreshell' };
      setChange(decision, 'Efficiency options', 'Column', 'Decrease particle size or implement SPP/Coreshell', null, 'A smaller particle size can improve efficiency/resolution but may increase back-pressure.');
      decision.cycle = 'EFFICIENCY';
      decision.stage = 'EFFICIENCY';
      decision.nextStage = 'EFFICIENCY_HANDOFF';
      return decision;
    }
    if (timeClass === 'above' && resolutionClass === 'near-below') {
      decision.action = 'Proceed to Efficiency; decrease particle size (must consider influence on backpressure), OR use SPP/Coreshell, AND increase flow rate to shorten run time.';
      decision.efficiencyObjective = 'INCREASE_RESOLUTION_AND_SHORTEN_RUN_TIME';
      decision.changedParameter = 'Efficiency options';
      decision.nextConditions.flowRateMlMin = 'Increase';
      decision.nextConditions.displayOverrides = { particleSizeUm: 'Decrease particle size; or implement SPP/Coreshell', flowRateMlMin: 'Increase' };
      setChange(decision, 'Efficiency options', 'Pump / Column', 'Decrease particle size; implement SPP/Coreshell; increase flow', null, 'Increase flow to shorten run time; monitor back-pressure while decreasing particle size.');
      decision.cycle = 'EFFICIENCY';
      decision.stage = 'EFFICIENCY';
      decision.nextStage = 'EFFICIENCY_HANDOFF';
      return decision;
    }
    if (timeClass === 'above' && resolutionClass === 'meets') {
      decision.action = 'Proceed to Efficiency; increase flow rate to shorten run time.';
      decision.efficiencyObjective = 'SHORTEN_RUN_TIME';
      decision.changedParameter = 'Flow rate';
      decision.nextConditions.flowRateMlMin = 'Increase';
      decision.nextConditions.displayOverrides = { flowRateMlMin: 'Increase' };
      setChange(decision, 'Flow rate', 'Pump', 'Increase', 'mL/min', 'Increasing flow rate shortens run time; monitor back-pressure.');
      decision.cycle = 'EFFICIENCY';
      decision.stage = 'EFFICIENCY';
      decision.nextStage = 'EFFICIENCY_HANDOFF';
      return decision;
    }
    if (timeClass === 'below' && resolutionClass === 'meets') {
      decision.status = 'METHOD_REQUIREMENTS_MET';
      decision.action = 'All specifications met!';
      decision.nextStage = 'COMPLETE';
      return decision;
    }
    decision.status = 'NOT_CONFIGURED';
    decision.action = 'No configured branch matches the current results.';
    return nextAtCurrentConditions(decision, stage);
  }

  function selectivityDecision(run, history, specifications, state, minBResult) {
    const conditions = run.conditions || {};
    const prior = getPriorDecision(history, run);
    const stage = prior?.decision?.nextStage || state?.stage || 'SELECTIVITY';
    const decision = baseDecision(run, 'SELECTIVITY_REQUIRED', 'SELECTIVITY', '', '', specifications);
    decision.nextStage = 'SELECTIVITY';
    const suggestedRun = bestRetentionRun(history, run, specifications);
    const suggestedB = number(suggestedRun?.conditions?.percentB) ?? number(conditions.percentB);
    const selectedB = number(state?.selectedPercentB);
    const currentSolvent = String(conditions.solventType || '');
    const currentLigand = conditions.ligand;
    if (selectedB === null) {
      decision.status = 'OBSERVE';
      decision.action = `Proceed to Selectivity using the optimal %B composition from Retention (OBSERVE)\n${suggestedB === null ? '' : ` [Suggested: ${suggestedB}%]`}; choose the optimal %B visually and upload the run at 40°C.`;
      decision.reason = 'The suggested optimal %B is based on the admissible Retention run that best meets specifications, ranked by peak count, then shorter run time, then resolution. Confirm the optimal %B visually; the tool does not select it for you.';
      decision.interaction = { type: 'selectivity-optimal-percent-b', suggestedPercentB: suggestedB };
      decision.nextConditions.percentB = null;
      decision.nextConditions.displayOverrides = { percentB: 'Chosen optimal %B (from next run)' };
      nextAtCurrentConditions(decision, 'SELECTIVITY');
      decision.nextConditions.percentB = null;
      decision.nextConditions.displayOverrides = { percentB: 'Chosen optimal %B (from next run)' };
      return setSelectivityStartingTemperature(decision);
    }
    decision.nextConditions.percentB = selectedB;
    decision.nextConditions.displayOverrides = { percentB: `${selectedB}%` };
    const matchingSystem = history.concat(run).filter((candidate) => sameGroup(candidate, run)
      && sameLigand(candidate, run)
      && sameSelectivitySetup(candidate, run));
    if (number(conditions.temperatureC) === 60
      && number(run.results?.peakCount) < specifications.targetPeakCount) {
      const retentionSolvent = retentionSolventForRun(history, run);
      if (retentionSolvent && !sameValue(currentSolvent, retentionSolvent)) {
        decision.status = 'LIGAND_CHANGE_REQUIRED';
        decision.action = 'Change ligand and repeat Retention & Selectivity runs on the new column.';
        decision.reason = `The 60°C run used ${currentSolvent}, which differs from the Retention solvent ${retentionSolvent}, and the peak-count specification remains unmet.`;
        return ligandChange(decision, currentLigand);
      }
      const matching40 = history.some((candidate) => sameGroup(candidate, run)
        && sameLigand(candidate, run)
        && sameSelectivitySetup(candidate, run)
        && sameValue(candidate.conditions?.solventType, currentSolvent)
        && number(candidate.conditions?.temperatureC) === 40
        && number(candidate.conditions?.percentB) === selectedB);
      const solventDecision = solventChange(decision, run, currentSolvent, selectedB, matchingSystem, state);
      const newSolvent = solventDecision.nextConditions?.solventType;
      const newSolventPercentB = number(solventDecision.nextConditions?.percentB);
      if (newSolvent && newSolventPercentB !== null && !sameValue(newSolvent, currentSolvent)) {
        solventDecision.action = `Next Selectivity step; change solvent to ${newSolvent} at ${newSolventPercentB}% B (converted), and begin at 40°C using the new solvent.`;
        solventDecision.reason = matching40
          ? `The same-group 40°C and 60°C runs at ${selectedB}% B used the Retention solvent ${currentSolvent} and remain below the peak-count specification; continue with the converted alternative solvent at 40°C.`
          : `The 60°C run used the Retention solvent ${currentSolvent} and remains below the peak-count specification; continue Selectivity with the converted alternative solvent at 40°C.`;
      }
      return solventDecision;
    }
    const temps = matchingSystem.filter((candidate) => sameValue(candidate.conditions?.percentB, selectedB)
      && sameValue(candidate.conditions?.solventType, currentSolvent))
      .map((candidate) => number(candidate.conditions?.temperatureC));
    const testedAt = (solvent, temp) => matchingSystem.some((candidate) => sameValue(candidate.conditions?.solventType, solvent)
      && sameValue(candidate.conditions?.percentB, selectedB)
      && sameValue(candidate.conditions?.temperatureC, temp));
    const isNewSolventSeries = normalized(currentSolvent) !== normalized(state?.startingSolvent || currentSolvent);
    const temperature = number(conditions.temperatureC);
    const has40 = testedAt(currentSolvent, 40);
    const has60 = testedAt(currentSolvent, 60);
    const customTemp = Number.isFinite(temperature) && temperature !== 40 && temperature !== 60 && temperature !== number(state?.startingTemperatureC);

    if (state?.forceSolventChangeAfter60 && temperature === 60 && has40 && has60 && !isNewSolventSeries) {
      const solventDecision = solventChange(decision, run, currentSolvent, selectedB, matchingSystem, state);
      const newSolvent = solventDecision.nextConditions?.solventType;
      const newSolventPercentB = number(solventDecision.nextConditions?.percentB);
      if (newSolvent && newSolventPercentB !== null && !sameValue(newSolvent, currentSolvent)) {
        solventDecision.action = `Next Selectivity step; change solvent to ${newSolvent} at ${newSolventPercentB}% B (converted), and begin at 40°C using the new solvent.`;
        solventDecision.reason = `The 40°C and 60°C runs at ${selectedB}% B in ${currentSolvent} have been tested; continue Selectivity using the alternative solvent at 40°C.`;
      }
      return solventDecision;
    }

    if (customTemp && number(run.results?.peakCount) < specifications.targetPeakCount) {
      if (isNewSolventSeries && state?.customTemperatureChoice === 'YES') {
        decision.status = 'LIGAND_CHANGE_REQUIRED';
        decision.action = 'Change Ligand, and repeat Retention/Selectivity cycles.';
        decision.reason = 'The selected additional temperature on the changed-solvent system did not meet the peak-count specification.';
        return ligandChange(decision, currentLigand);
      }
      return solventChange(decision, run, currentSolvent, selectedB, matchingSystem, state);
    }

    if (!has40 && temperature !== 60) {
      decision.action = `Next Selectivity step\nChange the temperature to 40°C, keeping the other run conditions as they are currently set.`;
      decision.reason = `The 40°C condition has not been tested for ${currentSolvent} at the selected %B.`;
      decision.changedParameter = 'Temperature';
      decision.nextConditions.temperatureC = 40;
      decision.nextConditions.displayOverrides = { temperatureC: '40°C' };
      setChange(decision, 'Temperature', 'Column Oven', '40', '°C', 'Temperature changes can alter relative peak spacing and selectivity.');
      decision.evidence.push(`Selected %B: ${selectedB ?? 'not available'}; solvent: ${currentSolvent}; ligand: ${currentLigand || 'not available'}.`);
      return decision;
    }
    if (!has60) {
      decision.action = `Next Selectivity step\nChange the temperature to 60°C, keeping the other run conditions as they are currently set.`;
      decision.reason = `The 40°C run remains below the peak-count specification; 60°C has not yet been tested for ${currentSolvent} at the selected %B.`;
      decision.changedParameter = 'Temperature';
      decision.nextConditions.temperatureC = 60;
      decision.nextConditions.displayOverrides = { temperatureC: '60°C' };
      setChange(decision, 'Temperature', 'Column Oven', '60', '°C', 'Temperature changes can alter relative peak spacing and selectivity.');
      return decision;
    }

    if (isNewSolventSeries && temperature === 60 && has40
      && number(run.results?.peakCount) < specifications.targetPeakCount) {
      decision.status = 'LIGAND_CHANGE_REQUIRED';
      decision.action = 'Change Ligand, and repeat Retention/Selectivity cycles.';
      decision.reason = 'The peak-count specification remains unmet after testing 40°C and 60°C in the new solvent.';
      return ligandChange(decision, currentLigand);
    }

    if (!isNewSolventSeries) {
      if (state?.post60Choice === 'ANOTHER_TEMPERATURE' && number(state?.customTemperatureC) !== null) {
        decision.action = `OBSERVE\nRun the method at ${state.customTemperatureC}°C, keeping the other run conditions as they are currently set.`;
        decision.nextConditions.temperatureC = number(state.customTemperatureC);
        decision.nextConditions.displayOverrides = { temperatureC: `${state.customTemperatureC}°C` };
        decision.changedParameter = 'Temperature';
        decision.interaction = { type: 'custom-temperature-observe', temperatureC: number(state.customTemperatureC) };
        setChange(decision, 'Temperature', 'Column Oven', String(state.customTemperatureC), '°C', 'User-selected temperature for additional selectivity observation.');
        return decision;
      }
      if (state?.post60Choice !== 'CHANGE_SOLVENT') {
        const conversion = convertIsoeluotropicPercentB(currentSolvent, selectedB);
        const solventChangeTarget = conversion.status === 'CALCULATED'
          ? ` (change to ${conversion.percentB}% B ${conversion.solventType})`
          : '';
        decision.status = 'OBSERVE';
        decision.action = `OBSERVE; You may rerun the method at another temperature of your choosing, or continue to a solvent change${solventChangeTarget}.`;
        decision.reason = 'You may rerun the method at another temperature of your choosing, or continue to a solvent change.';
        decision.statusSummaryInReason = true;
        decision.changedParameter = 'Temperature or solvent';
        decision.equipmentAction = {
          parameter: 'Temperature or solvent',
          controllingModule: 'Column Oven or Solvents',
          currentValue: `${number(conditions.temperatureC) ?? 60}°C or ${currentSolvent}${selectedB === null ? '' : ` at ${selectedB}% B`}`,
          recommendedValue: `chosen temperature or ${conversion.status === 'CALCULATED' ? `${conversion.solventType} at ${conversion.percentB}% B` : 'new solvent'}`,
          units: null,
          minimum: null,
          maximum: null,
          range: '°C for temperature',
          effect: 'A chosen temperature may be chosen to see whether a better Selectivity is obtained before changing solvent, or you may go straight to a solvent change.'
        };
        decision.interaction = { type: 'retention-selectivity-observe', choices: ['ANOTHER_TEMPERATURE', 'CHANGE_SOLVENT'] };
        decision.evidence.push(has40
          ? 'Both 40°C and 60°C have been tested at the selected %B, with fewer peaks than specified.'
          : 'A 60°C run is present, but no matching 40°C run was found in this group; continue forward without repeating 40°C.');
        nextAtCurrentConditions(decision, 'SELECTIVITY');
        decision.nextConditions.displayOverrides = {
          solventType: `${currentSolvent} → ${conversion.status === 'CALCULATED' ? conversion.solventType : 'new solvent'} (OR temp)`,
          temperatureC: `${number(conditions.temperatureC) ?? 60}°C → chosen temp. (OR solvent)`
        };
        return decision;
      }
      return solventChange(decision, run, currentSolvent, selectedB, matchingSystem, state);
    }

    if (state?.post60Choice === 'NO' || state?.post60Choice === 'LIGAND') {
      decision.status = 'LIGAND_CHANGE_REQUIRED';
      decision.action = 'Change Ligand, and repeat Retention/Selectivity cycles.';
      decision.reason = 'The changed-solvent Selectivity conditions have been exhausted and the user chose not to test another temperature.';
      return ligandChange(decision, currentLigand);
    }
    if (state?.post60Choice === 'YES' && number(state?.customTemperatureC) !== null) {
      const testedCustom = matchingSystem.some((candidate) => sameValue(candidate.conditions?.temperatureC, state.customTemperatureC)
        && sameValue(candidate.conditions?.solventType, currentSolvent)
        && sameValue(candidate.conditions?.percentB, selectedB));
      if (!testedCustom) {
        decision.status = 'OBSERVE';
        decision.action = `OBSERVE\nRun the method at ${state.customTemperatureC}°C, keeping the other run conditions as they are currently set.`;
        decision.nextConditions.temperatureC = number(state.customTemperatureC);
        decision.nextConditions.displayOverrides = { temperatureC: `${state.customTemperatureC}°C` };
        decision.changedParameter = 'Temperature';
        return decision;
      }
      decision.status = 'LIGAND_CHANGE_REQUIRED';
      decision.action = 'Change Ligand, and repeat Retention/Selectivity cycles.';
      decision.reason = 'The additional temperature on the changed-solvent system remains below the peak-count specification.';
      return ligandChange(decision, currentLigand);
    }
    decision.status = 'OBSERVE';
    decision.action = temperature === 60
      ? "OBSERVE; You may rerun the method at another temperature of your choosing, or continue to a Ligand change. View possible new ligands under the 'Column' Instrument module in the 'Equipment' tab"
      : 'OBSERVE';
    decision.reason = temperature === 60
      ? 'The 40°C and 60°C conditions in the new solvent remain below the peak-count specification. Select Yes to test another temperature or No to change ligand.'
      : 'You may rerun the method at another temperature of your choosing. Select Yes to test a new temperature or No to change ligand.';
    decision.interaction = { type: 'changed-solvent-temperature-choice', choices: ['YES', 'NO'] };
    return nextAtCurrentConditions(decision, 'SELECTIVITY');
  }

  function solventChange(decision, run, currentSolvent, selectedB, matchingSystem, state = {}) {
    let conversion = convertIsoeluotropicPercentB(currentSolvent, selectedB);
    const manualPercentB = number(state.manualSolventPercentB);
    if (conversion.status !== 'CALCULATED' && manualPercentB !== null && manualPercentB >= 0 && manualPercentB <= 100) {
      conversion = {
        status: 'CALCULATED',
        percentB: manualPercentB,
        solventType: normalized(currentSolvent).replace(/\s/g, '') === 'acn' ? 'MeOH' : 'ACN',
        manuallyEntered: true
      };
    }
    if (conversion.status !== 'CALCULATED') {
      decision.status = 'NOT_CONFIGURED';
      decision.action = 'Enter %B of new solvent manually';
      decision.reason = `No supplied nomogram entry converts ${selectedB}% ${currentSolvent}. Enter the chosen %B for ${normalized(currentSolvent).replace(/\s/g, '') === 'acn' ? 'MeOH' : 'ACN'} to continue.`;
      decision.missingData = [`nomogram conversion for ${selectedB}% ${currentSolvent}`];
      decision.interaction = {
        type: 'manual-solvent-percent-b',
        solventType: normalized(currentSolvent).replace(/\s/g, '') === 'acn' ? 'MeOH' : 'ACN',
        sourcePercentB: selectedB
      };
      return nextAtCurrentConditions(decision, 'SELECTIVITY');
    }
    decision.status = 'SELECTIVITY_REQUIRED';
    decision.action = conversion.manuallyEntered
      ? `Proceed to Solvent change: ${conversion.solventType} [${conversion.percentB}% B, entered manually]. Then test 40°C and 60°C.`
      : `Proceed to Solvent change: ${conversion.solventType} [${conversion.percentB}% B, isoeluotropic${conversion.interpolated ? ' interpolated' : ''} equivalent]. Then test 40°C and 60°C.`;
    decision.reason = conversion.manuallyEntered
      ? `The user supplied ${conversion.percentB}% B for ${conversion.solventType}; no matching nomogram value was available for ${selectedB}% ${currentSolvent}.`
      : `The 40°C and 60°C conditions on ${currentSolvent} did not achieve the peak-count specification. The supplied nomogram${conversion.interpolated ? ', linearly interpolated between its adjacent entries,' : ''} maps ${selectedB}% ${currentSolvent} to ${conversion.percentB}% ${conversion.solventType}.`;
    decision.changedParameter = 'Solvent type and %B';
    decision.nextConditions.solventType = conversion.solventType;
    decision.nextConditions.percentB = conversion.percentB;
    decision.nextConditions.temperatureC = 40;
    decision.nextConditions.displayOverrides = { solventType: conversion.solventType, percentB: `${conversion.percentB}%${conversion.manuallyEntered ? ' (entered manually)' : conversion.interpolated ? ' (isoeluotropic interpolated)' : ' (isoeluotropic)'}`, temperatureC: '40°C' };
    decision.nextStage = 'SELECTIVITY';
    decision.selectivityStartingSolvent = conversion.solventType;
    decision.selectivityStartingPercentB = conversion.percentB;
    setChange(decision, 'Solvent type', 'Solvents', `${conversion.solventType} at ${conversion.percentB}% B`, '%B', conversion.manuallyEntered ? 'User-entered solvent strength; visually assess chromatogram and results.' : 'An isoeluotropic solvent change alters relative analyte interactions; the supplied nomogram preserves approximate solvent strength.');
    return decision;
  }

  function ligandChange(decision, currentLigand) {
    decision.changedParameter = 'Ligand';
    decision.nextConditions.ligand = 'Choose another available ligand. You may refer to the Column Instrument Module of the Equipment tab to view new possible columns/ligands.';
    decision.nextConditions.solventType = 'ACN';
    decision.nextConditions.percentB = 100;
    decision.nextConditions.displayOverrides = {
      ligand: 'Choose another available ligand. You may refer to the Column Instrument Module of the Equipment tab to view new possible columns/ligands.',
      solventType: 'ACN',
      percentB: '100% (restart Retention at highest %B)'
    };
    decision.nextStage = 'RETENTION';
    decision.resetRetentionForLigand = normalized(currentLigand);
    setChange(decision, 'Ligand', 'Column', decision.nextConditions.ligand, null, 'A new ligand changes stationary-phase interactions; Retention and Selectivity must be repeated.');
    return decision;
  }

  function evaluateDecision({ run, history = [], specifications, state = {} }) {
    const specs = specifications || run?.methodSpecifications || {};
    const results = run?.results || {};
    const conditions = run?.conditions || {};
    const currentHistory = history.filter((candidate) => candidate.id !== run?.id);
    const stageFromPrior = getPriorDecision(currentHistory, run)?.decision?.nextStage;
    const previousMinimumRun = priorCompletedMinimumRun(currentHistory, run);
    const previousSelectivityRecommendation = priorSelectivityRecommendation(currentHistory, run);
    const retentionSolvent = retentionSolventForRun(currentHistory, run);
    const isSelectivityTemperatureAfterMinimum = number(conditions.temperatureC) === 40;
    const isSelectivityTemperatureAfterRecommendation = Boolean(previousSelectivityRecommendation)
      && number(conditions.temperatureC) === 40
      && number(previousSelectivityRecommendation.conditions?.temperatureC) !== number(conditions.temperatureC);
    const startingSolvent = retentionSolvent || state.startingSolvent || '';
    const isInitialSolvent60AfterMatched40 = retentionSolvent !== null
      && Boolean(retentionSolvent)
      && number(conditions.temperatureC) === 60
      && hasPriorSelectivityTemperatureAtPercentB(currentHistory, run, 40)
      && Boolean(startingSolvent)
      && sameValue(conditions.solventType, startingSolvent);
    const ambientIntermediateAfterMinimum = isAmbientIntermediateRunAfterMinimum(currentHistory, run, previousMinimumRun);
    const selectivityStartRun = previousMinimumRun || previousSelectivityRecommendation;
    const decisionState = isSelectivityTemperatureAfterMinimum || isSelectivityTemperatureAfterRecommendation || isInitialSolvent60AfterMatched40
      ? {
        ...state,
        stage: 'SELECTIVITY',
        retentionObserveChoice: 'SELECTIVITY',
        selectedPercentB: number(conditions.percentB),
        startingSolvent: String(conditions.solventType || selectivityStartRun?.conditions?.solventType || startingSolvent),
        startingTemperatureC: selectivityStartRun?.conditions?.temperatureC ?? state.startingTemperatureC ?? null,
        forceSolventChangeAfter60: isInitialSolvent60AfterMatched40
      }
      : { ...state, ambientIntermediateAfterMinimum };
    const userSelectedSelectivity = decisionState.stage === 'SELECTIVITY' || decisionState.retentionObserveChoice === 'SELECTIVITY';
    const isAmbientRetentionRun = number(conditions.temperatureC) === 25
      || /^amb(?:ient)?(?:\b|\s|\()/i.test(String(conditions.temperatureDisplay || ''));
    const activeStage = isAmbientRetentionRun
      ? 'RETENTION'
      : userSelectedSelectivity ? 'SELECTIVITY' : stageFromPrior || decisionState.stage || 'RETENTION';
    const minB = calculateMinimumPercentB(currentHistory.concat(run), run, specs);
    const minBValue = minB.sufficientData ? minB.minimumPercentB : null;
    const uploadedAtMinimumB = isMinimumBRun(currentHistory, run, minBValue);
    let decision;

    if (number(results.backPressurePsi) === null) {
      decision = baseDecision(run, 'INSUFFICIENT_DATA', activeStage, 'Back-pressure cannot be evaluated.', 'A measured back-pressure value is required before peak count, run time, or resolution can be assessed.', specs);
      decision.missingData = ['back-pressure'];
      decision.evidence.push(`Maximum back-pressure specification: ${wholePsi(specs.maximumBackpressurePsi)} psi.`);
      decision = nextAtCurrentConditions(decision, activeStage);
    } else if (number(results.backPressurePsi) < 0) {
      decision = baseDecision(run, 'INVALID_INPUT', activeStage, 'The measured back-pressure is invalid.', 'Back-pressure cannot be negative; correct or re-import the run data before proceeding.', specs);
      decision.evidence.push(`Reported back-pressure: ${wholePsi(results.backPressurePsi)} psi.`);
      decision = nextAtCurrentConditions(decision, activeStage);
    } else if (results.backPressurePsi > specs.maximumBackpressurePsi) {
      decision = baseDecision(run, 'BACK_PRESSURE', activeStage, 'Do not proceed to later decision checks until back-pressure is within specification. Review the pump/column pressure conditions.', 'Backpressure is outside the specification; peak count, tR, and resolution were not assessed.', specs);
      decision.changedParameter = 'Back-pressure';
      decision.equipmentAction = { parameter: 'Back-pressure', controllingModule: 'Pump / Column', currentValue: Math.round(results.backPressurePsi), recommendedValue: 'Investigate and reduce to within specification', units: 'psi', minimum: null, maximum: Math.round(specs.maximumBackpressurePsi), range: `Maximum ${wholePsi(specs.maximumBackpressurePsi)} psi`, effect: 'Back-pressure must meet specification before the method-development sequence proceeds.' };
      decision.evidence.push(`Measured: ${wholePsi(results.backPressurePsi)} psi. Maximum: ${wholePsi(specs.maximumBackpressurePsi)} psi.`);
      decision = nextAtCurrentConditions(decision, activeStage);
    } else if (number(results.peakCount) === null) {
      decision = baseDecision(run, 'INSUFFICIENT_DATA', activeStage, 'Peak count cannot be evaluated.', 'No valid peak count was obtained; run time and resolution were not evaluated.', specs);
      decision.missingData = ['peak count'];
      decision.evidence.push(`Back-pressure ${wholePsi(results.backPressurePsi)} psi is within specification.`);
      decision = nextAtCurrentConditions(decision, activeStage);
    } else if (!Number.isInteger(number(results.peakCount)) || number(results.peakCount) < 0) {
      decision = baseDecision(run, 'INVALID_INPUT', activeStage, 'The reported peak count is invalid.', 'Peak count must be a non-negative whole number; correct or re-import the run data.', specs);
      decision = nextAtCurrentConditions(decision, activeStage);
    } else if (results.peakCount > specs.targetPeakCount || number(results.declaredPeakCount) > specs.targetPeakCount) {
      const observedPeakCount = Math.max(number(results.peakCount) || 0, number(results.declaredPeakCount) || 0);
      decision = baseDecision(run, 'INVESTIGATE', 'INVESTIGATE', 'INVESTIGATE before continuing to run-time or resolution checks.', 'Peak count is above the specification. If an extra peak has both area and height markedly below the major peaks, it may be an artefact, degradation product, or carryover; inspect it visually before deciding whether it is a real analyte. Do not continue to run-time or resolution checks.', specs);
      decision.evidence = (results.peaks || []).map((peak) => `Peak ${peak.peakNumber ?? peak.index ?? '?'}: tR ${peak.retentionTimeMin ?? 'unavailable'} min; area ${peak.area ?? 'unavailable'}; height ${peak.height ?? 'unavailable'}.`);
      for (const peak of results.excludedArtifactPeaks || []) {
        decision.evidence.push(`Excluded peak row ${peak.peakNumber}: tR ${peak.retentionTimeMin} min; area ${peak.area ?? 'unavailable'}; height ${peak.height ?? 'unavailable'}. Compare both values with major peaks and review visually.`);
      }
      if (results.declaredPeakCount !== null && results.peakCount < results.declaredPeakCount) decision.evidence.push(`Declared count: ${results.declaredPeakCount}; retained official count after the existing parser area filter: ${results.peakCount}.`);
      decision = nextAtCurrentConditions(decision, 'INVESTIGATE');
    } else if (number(conditions.percentB) === null || number(conditions.percentB) < 0 || number(conditions.percentB) > 100) {
      decision = baseDecision(run, 'INVALID_INPUT', activeStage, 'The %B condition is invalid or missing.', '%B must be available and within the 0-100% range before Retention or Selectivity can be evaluated.', specs);
      decision.missingData = number(conditions.percentB) === null ? ['%B'] : [];
      decision.evidence.push(`Reported %B: ${conditions.percentB ?? 'unavailable'}.`);
      decision = nextAtCurrentConditions(decision, activeStage);
    } else if (number(conditions.temperatureC) === 60 && number(results.peakCount) < specs.targetPeakCount) {
      const sixtyDegreeState = {
        ...decisionState,
        stage: 'SELECTIVITY',
        retentionObserveChoice: 'SELECTIVITY',
        selectedPercentB: number(conditions.percentB),
        startingSolvent: retentionSolvent || state.startingSolvent || String(conditions.solventType || '')
      };
      decision = selectivityDecision(run, currentHistory, specs, sixtyDegreeState, minB);
    } else if (uploadedAtMinimumB) {
      decision = retentionDecision(run, currentHistory, specs, decisionState, minB);
    } else if (isSelectivityTemperatureAfterMinimum || isSelectivityTemperatureAfterRecommendation || isInitialSolvent60AfterMatched40) {
      decision = selectivityDecision(run, currentHistory, specs, decisionState, minB);
    } else if (results.peakCount === specs.targetPeakCount) {
      const cycle = activeStage === 'SELECTIVITY' ? 'SELECTIVITY' : 'RETENTION';
      decision = timeResolutionDecision(run, specs, cycle, currentHistory, decisionState);
      if (minB.sufficientData && !decision.evidence.some((item) => String(item).includes('Calculated Min %B'))) {
        decision.evidence.push(`Calculated Min %B: ${minBValue}%.`);
      }
      if (cycle === 'RETENTION' && minB.sufficientData && number(conditions.percentB) === minBValue) {
        decision.minBRunEvaluated = true;
      }
    } else if (activeStage === 'SELECTIVITY') {
      decision = selectivityDecision(run, currentHistory, specs, decisionState, minB);
    } else {
      decision = retentionDecision(run, currentHistory, specs, decisionState, minB);
    }

    decision.minimumPercentB = minBValue;
    decision.minimumPercentBCalculation = minB;
    decision.currentConditions = { ...(conditions || {}) };
    decision.methodSpecifications = { ...specs };
    decision.evidence = [...(decision.evidence || [])];
    decision.statusSummary = qualitativeStatusSummary(run, specs);
    const retentionPercentB = number(conditions.percentB);
    const bothBoundaryRetentionRunsUploaded = hasRetentionRunAtPercentB(currentHistory, run, 40)
      && hasRetentionRunAtPercentB(currentHistory, run, 30);
    const shouldShowMinimumAtCurrentRetentionB = retentionPercentB === 40
      ? minBValue > 30
      : retentionPercentB === 30 && minBValue <= 30;
    if (activeStage === 'RETENTION' && minBValue !== null
      && bothBoundaryRetentionRunsUploaded
      && shouldShowMinimumAtCurrentRetentionB
      && !String(decision.reason || '').includes(`Note the Min %B is ${minBValue}%`)) {
      decision.reason = [decision.reason, `Note the Min %B is ${minBValue}%.`].filter(Boolean).join('\n\n');
      decision.statusSummaryInReason = true;
      decision.suppressEvidence = true;
    }
    if (minB.sufficientData && !decision.evidence.some((item) => String(item).includes('Calculated Min %B'))) {
      decision.evidence.push(`Calculated Min %B: ${minBValue}%. ${minB.reason}`);
    } else if (!minB.sufficientData && activeStage !== 'INVESTIGATE' && decision.status !== 'BACK_PRESSURE' && decision.status !== 'INSUFFICIENT_DATA') {
      decision.evidence.push(`Min %B not available: ${minB.reason}`);
    }
    if (results.peakCountAdjustmentNote) {
      decision.reason = [decision.reason, results.peakCountAdjustmentNote].filter(Boolean).join('\n\n');
    }
    decision.displayMessage = `Current cycle: ${decision.cycle || decision.stage}\n${decision.action || decision.reason || 'Decision unavailable.'}\n${decision.statusSummary}`;
    return decision;
  }

  function retentionDecision(run, history, specifications, state, minB) {
    const conditions = run.conditions || {};
    const results = run.results || {};
    const currentB = number(conditions.percentB);
    const lastTime = number(results.lastPeakRetentionTimeMin);
    const maximumTime = number(specifications.maximumRunTimeMin);
    const decision = baseDecision(run, 'RETENTION_REQUIRED', 'RETENTION', '', '', specifications);
    const minimumB = minB.sufficientData ? minB.minimumPercentB : null;
    const priorSameSystem = history.filter((candidate) => sameRetentionSystem(candidate, run));
    const lostTargetAfterDecrease = priorSameSystem.some((candidate) => number(candidate.results?.peakCount) >= specifications.targetPeakCount
      && number(candidate.conditions?.percentB) > currentB
      && candidate.conditions.percentB > conditions.percentB);
    const minBRun = isMinimumBRun(history, run, minimumB);
    const approaching = lastTime !== null && maximumTime !== null
      && (lastTime > maximumTime - 1 || lastTime * 2 > maximumTime);
    const bestRun = bestRetentionRun(priorSameSystem, run, specifications, true);
    const suggestedB = number(bestRun?.conditions?.percentB)
      ?? (minBRun ? null : number(state.selectedPercentB) ?? currentB);
    decision.evidence.push(`Back-pressure ${wholePsi(results.backPressurePsi)} psi is within the ${wholePsi(specifications.maximumBackpressurePsi)} psi limit.`, `${results.peakCount} peaks observed; target is ${specifications.targetPeakCount}.`);
    if (lastTime !== null) decision.evidence.push(`Last-peak tR: ${lastTime} min; maximum run time: ${maximumTime} min.`);
    if (minB.sufficientData) decision.evidence.push(`Calculated Min %B: ${minimumB}%. ${minB.reason}`);

    if (lastTime === null || currentB === null) {
      decision.status = 'INSUFFICIENT_DATA';
      decision.action = 'Retention cannot be advanced until %B and last-peak tR are available.';
      decision.reason = 'Both the current %B and last-peak retention time are required to choose the next Retention step.';
      decision.missingData = [lastTime === null ? 'last-peak retention time' : null, currentB === null ? '%B' : null].filter(Boolean);
      return nextAtCurrentConditions(decision, 'RETENTION');
    }
    if (minBRun) {
      const minBDecision = observeRetention(decision, suggestedB, minimumB, qualitativeStatusSummary(run, specifications), bestRun);
      minBDecision.action = `Run an intermediate %B (OBSERVE) or proceed to Selectivity using the optimal %B composition from Retention (OBSERVE)\n${suggestedB === null ? 'Choose the optimal %B visually and upload the run at 40°C.' : `[Suggested: ${suggestedB}%]; choose the optimal %B visually and upload the run at 40°C.`}`;
      minBDecision.reason = qualitativeStatusSummary(run, specifications);
      minBDecision.minBRunEvaluated = true;
      minBDecision.suppressEvidence = true;
      return setIntermediateOrSelectivityOptions(minBDecision, run);
    }
    if (state.ambientIntermediateAfterMinimum && results.peakCount < specifications.targetPeakCount) {
      return selectivityDecision(run, history, specifications, {
        ...state,
        stage: 'SELECTIVITY',
        retentionObserveChoice: 'SELECTIVITY',
        selectedPercentB: null
      }, minB);
    }
    if (currentB === 40 && minimumB !== null && !minBRun) {
      decision.reason = `${qualitativeStatusSummary(run, specifications)}${minimumB > 30 ? `\n\nNote the Min %B is ${minimumB}%.` : ''}`;
      decision.suppressEvidence = true;
      decision.statusSummaryInReason = true;
      decision.changedParameter = '%B';
      decision.nextStage = 'RETENTION';
      if (minimumB > 30) {
        decision.action = `Proceed to run the minimum %B, calculated as ${minimumB}%.`;
        decision.nextConditions.percentB = minimumB;
        decision.nextConditions.minimumPercentB = minimumB;
        decision.nextConditions.displayOverrides = { percentB: `Minimum %B: ${minimumB}%` };
        setChange(decision, '%B', 'Solvents', `Minimum %B: ${minimumB}%`, '%', 'Calculated minimum %B; running at 30% B would exceed the supported retention boundary.');
      } else {
        decision.action = 'Decrease %B by 10 percentage points to 30%, keeping the other run conditions unchanged.';
        decision.nextConditions.percentB = 30;
        decision.nextConditions.minimumPercentB = minimumB;
        decision.nextConditions.displayOverrides = { percentB: '30% B' };
        setChange(decision, '%B', 'Solvents', '30% B', '%', 'Continue the Retention sequence at 30% B before reporting the calculated minimum %B.');
      }
      return decision;
    }
    if (maximumTime !== null && lastTime > maximumTime) {
      if (bestRun) {
        observeRetention(decision, suggestedB, minimumB, 'tR is above the run-time specification. Do not decrease %B further; restore an admissible previously tested %B and OBSERVE before Selectivity.', bestRun);
        decision.nextConditions.percentB = number(bestRun.conditions.percentB);
        decision.nextConditions.displayOverrides = { percentB: `${bestRun.conditions.percentB}% (previous run-time-admissible condition)` };
        decision.changedParameter = '%B';
        return decision;
      }
      decision.status = 'INSUFFICIENT_DATA';
      decision.action = 'The run exceeds the maximum time and no previous admissible Retention condition is available.';
      decision.reason = 'tR is above the specification. Do not decrease %B further; a previously tested run within the time specification is needed to choose an admissible Retention condition.';
      return nextAtCurrentConditions(decision, 'RETENTION');
    }
    const isIntermediatePercentB = currentB % 10 !== 0 && currentB !== minimumB;
    if (isIntermediatePercentB && !minBRun) {
      observeRetention(decision, suggestedB, minimumB, '', bestRun);
      decision.action = `OBSERVE, then proceed to Selectivity with the optimal %B [Suggested: ${suggestedB}% B]; choose the optimal %B visually and upload the run at 40°C.`;
      const suggestionReason = bestRun
        ? `Suggested %B: ${suggestedB}% B, based on the admissible run ranked by peak count, then shorter run time, then resolution.`
        : `Suggested %B: ${suggestedB}% B, the current intermediate condition for visual comparison; no complete comparable Retention set is available to rank alternatives.`;
      decision.reason = [
        'Backpressure is within the specification, peak count is below the specification, tR is within the specification.',
        minimumB === null ? 'Min %B is not available because the available Retention data do not meet the calculation requirements.' : `Min %B: ${minimumB}%`,
        suggestionReason
      ].join('\n\n');
      decision.suppressEvidence = true;
      return setSelectivityStartingTemperature(decision);
    }
    const confirmedIntermediate = Number.isFinite(state.intermediatePercentB)
      && currentB === state.intermediatePercentB
      && priorSameSystem.some((candidate) => Number(candidate.decision?.nextConditions?.percentB) === currentB
        && /intermediate/i.test(String(candidate.decision?.action || '')));
    if (confirmedIntermediate || state.ambientIntermediateAfterMinimum) {
      return selectivityDecision(run, history, specifications, { ...state, stage: 'SELECTIVITY', retentionObserveChoice: 'SELECTIVITY', selectedPercentB: null }, minB);
    }
    const intermediateChosen = state.retentionObserveChoice === 'INTERMEDIATE' && number(state.intermediatePercentB) !== null;
    if (lostTargetAfterDecrease && !(intermediateChosen && (minimumB === null || minBRun))) {
      if (minimumB !== null && !minBRun) {
        decision.action = `Perform a run at the minimum %B, ${minimumB}%, then OBSERVE and either run an intermediate %B or proceed to Selectivity.`;
        decision.reason = 'A previously achieved peak count fell after lowering %B; do not continue the standard ladder. The calculated Min %B provides the next boundary run.';
        decision.nextConditions.percentB = minimumB;
        decision.nextConditions.minimumPercentB = minimumB;
        decision.nextConditions.displayOverrides = { percentB: `Minimum %B: ${minimumB}%` };
        decision.changedParameter = '%B';
        decision.nextStage = 'RETENTION';
        setChange(decision, '%B', 'Solvents', `Minimum %B: ${minimumB}%`, '%', 'Calculated from valid same-system Retention data after a peak-count loss at lower %B.');
        return decision;
      }
      return observeRetention(decision, suggestedB, minimumB, 'A previous higher-%B Retention run met the peak specification, but this lower-%B run did not. Do not continue blindly down the %B ladder; OBSERVE the retention runs and choose an appropriate condition.', bestRun);
    }
    if (state.retentionObserveChoice === 'INTERMEDIATE' && number(state.intermediatePercentB) !== null) {
      decision.status = 'RETENTION_REQUIRED';
      decision.action = `Run an intermediate %B condition at ${state.intermediatePercentB}%.`;
      decision.reason = 'This user-selected intermediate %B has not yet been evaluated; visually compare it with the two best Retention runs.';
      decision.intermediateBRunEvaluated = true;
      decision.nextConditions.percentB = number(state.intermediatePercentB);
      decision.nextConditions.displayOverrides = { percentB: `${state.intermediatePercentB}% (intermediate)` };
      decision.changedParameter = '%B';
      setChange(decision, '%B', 'Solvents', `${state.intermediatePercentB}%`, '%', 'An intermediate %B is selected to compare peak spacing between the best Retention conditions.');
      return decision;
    }
    if (currentB === 30 && minimumB === null) {
      observeRetention(decision, suggestedB, null, '', bestRun);
      decision.action = `OBSERVE: then proceed with the optimal %B [Suggested: ${suggestedB}% B]; choose the optimal %B visually, or upload the complete Retention cycle runs for Min %B to be calculated.`;
      decision.reason = [
        'Backpressure meets specifications, peaks are below specification, tR is within specification.',
        'Min %B is not available because the available Retention data do not meet the calculation requirements.',
        bestRun ? `Suggested %B ${suggestedB}% is based on the admissible run ranked by peak count, then shorter run time, then resolution.` : ''
      ].filter(Boolean).join('\n\n');
      decision.suppressEvidence = true;
      return setSelectivityStartingTemperature(decision);
    }
    if (approaching) {
      if (minimumB !== null) {
        decision.action = `Perform a run at the minimum %B, ${minimumB}%, then OBSERVE and either run an intermediate %B or proceed to Selectivity using the optimal %B composition.`;
        decision.reason = lastTime > maximumTime - 1
          ? 'tR is approaching the run-time specification; a further standard %B decrease could exceed the limit.'
          : 'The next standard %B decrease is predicted to exceed the run-time specification.';
        decision.nextConditions.percentB = minimumB;
        decision.nextConditions.minimumPercentB = minimumB;
        decision.nextConditions.displayOverrides = { percentB: `Minimum %B: ${minimumB}%` };
        decision.changedParameter = '%B';
        decision.nextStage = 'RETENTION';
        setChange(decision, '%B', 'Solvents', `Minimum %B: ${minimumB}%`, '%', 'Calculated from valid same-system Retention data to remain within the run-time specification.');
        return decision;
      }
      decision.evidence.push(minB.reason);
      return observeRetention(decision, suggestedB, null, 'tR is approaching the run-time limit, but Min %B cannot be calculated from the available valid data. Do not lower %B blindly; select the best admissible Retention condition and proceed to Selectivity.', bestRun, 'INSUFFICIENT_DATA');
    }

    const nextB = currentB - 10;
    const testedNextB = priorSameSystem.some((candidate) => number(candidate.conditions?.percentB) === nextB);
    if (nextB >= 30 && !testedNextB) {
      decision.status = 'RETENTION_REQUIRED';
      decision.action = `Decrease %B by 10 percentage points to ${nextB}%, keeping the other run conditions unchanged.`;
      decision.reason = qualitativeStatusSummary(run, specifications);
      decision.statusSummaryInReason = true;
      decision.suppressEvidence = true;
      decision.nextConditions.percentB = nextB;
      decision.changedParameter = '%B';
      decision.nextStage = 'RETENTION';
      setChange(decision, '%B', 'Solvents', `${nextB}%`, '%', 'Decreasing %B extends retention to investigate missing or co-eluting peaks.');
      return decision;
    }
    if (minimumB !== null && !minBRun) {
      decision.action = `The standard Retention ladder has reached 30% B; perform the calculated Min %B run at ${minimumB}%.`;
      decision.reason = 'Continue to the calculated minimum-%B boundary before OBSERVE and Selectivity.';
      decision.nextConditions.percentB = minimumB;
      decision.nextConditions.minimumPercentB = minimumB;
      decision.nextConditions.displayOverrides = { percentB: `Minimum %B: ${minimumB}%` };
      decision.changedParameter = '%B';
      decision.nextStage = 'RETENTION';
      setChange(decision, '%B', 'Solvents', `Minimum %B: ${minimumB}%`, '%', 'Calculated from valid same-system Retention data.');
      return decision;
    }
    return observeRetention(decision, suggestedB, minimumB, 'The standard 10-point Retention ladder is exhausted. OBSERVE the available runs and select an appropriate Retention condition before Selectivity.', bestRun);
  }

  function observeRetention(decision, suggestedB, minimumB, reason, bestRun, status = 'OBSERVE') {
    decision.status = status;
    decision.cycle = 'RETENTION (OBSERVE)';
    decision.stage = 'OBSERVE';
    decision.action = `OBSERVE${suggestedB === null ? '' : ` [Suggested: ${suggestedB}% B]; choose the optimal %B visually.`}`;
    decision.reason = reason;
    decision.nextStage = 'OBSERVE';
    decision.interaction = { type: 'retention-observe', suggestedPercentB: suggestedB, minimumPercentB: minimumB, bestRunId: bestRun?.id || null };
    decision.nextConditions = { ...(decision.currentConditions || {}) };
    decision.nextConditions.displayOverrides = { percentB: suggestedB === null ? 'Choose optimal %B' : `Chosen optimal %B (suggested ${suggestedB}%)` };
    if (minimumB !== null) decision.evidence.push(`Calculated Min %B: ${minimumB}%.`);
    if (bestRun) decision.evidence.push(`Suggested %B ${bestRun.conditions.percentB}% is based on the admissible run ranked by peak count, then shorter run time, then resolution.`);
    return decision;
  }

  app.calculateMinimumPercentB = calculateMinimumPercentB;
  app.convertIsoeluotropicPercentB = convertIsoeluotropicPercentB;
  app.compareSelectivityConditions = sameTestedCondition;
  app.evaluateMethodDecision = evaluateDecision;
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});