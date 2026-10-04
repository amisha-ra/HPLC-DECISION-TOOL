(function (app) {
  const numberPattern = /^\d+(?:\.\d+)?$/;

  function parseNumber(value) {
    if (!numberPattern.test(String(value).trim())) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function identifyBlankSampleType(parts) {
    const marker = (parts[9] ?? '').trim();
    const match = marker.match(/^(BLANK|BLK)(?:$|[-\d.])/i);
    return match ? match[1].toUpperCase() : null;
  }

  const columnLigands = new Map([
    ['C18', 'C18'],
    ['C18AQ', 'C18 AQ'],
    ['C8', 'C8'],
    ['PFP', 'PFP'],
    ['PFPP', 'PFPP'],
    ['BIPH', 'BiPH'],
    ['IBD', 'IBD']
  ]);

  const beadTypeNames = {
    P: 'Pinnacle DB',
    U: 'Ultra',
    F: 'Force',
    R: 'Raptor'
  };

  function normalizeLigand(value) {
    return String(value ?? '').replace(/[\s_-]+/g, '').toUpperCase();
  }

  function parseColumnIdentifier(identifier) {
    const rawIdentifier = String(identifier ?? '').trim();
    const explicitSuffixMatch = rawIdentifier.match(/^(.*?)-(Fo|[PURF])$/i);
    const attachedSuffixMatch = rawIdentifier.match(/^(.+?)(Fo|[PURF])$/i);
    let ligandPart = rawIdentifier;
    let beadCode = '';

    if (/^(?:Fo|[PUR])$/i.test(rawIdentifier)) {
      ligandPart = '';
      beadCode = rawIdentifier.toUpperCase() === 'FO' ? 'F' : rawIdentifier.toUpperCase();
    } else if (explicitSuffixMatch && (!explicitSuffixMatch[1] || columnLigands.has(normalizeLigand(explicitSuffixMatch[1])))) {
      ligandPart = explicitSuffixMatch[1].trim();
      beadCode = explicitSuffixMatch[2].toUpperCase() === 'FO' ? 'F' : explicitSuffixMatch[2].toUpperCase();
    } else if (!columnLigands.has(normalizeLigand(rawIdentifier)) && attachedSuffixMatch && columnLigands.has(normalizeLigand(attachedSuffixMatch[1]))) {
      ligandPart = attachedSuffixMatch[1].trim();
      beadCode = attachedSuffixMatch[2].toUpperCase() === 'FO' ? 'F' : attachedSuffixMatch[2].toUpperCase();
    }

    const normalizedLigand = normalizeLigand(ligandPart);
    return {
      ligand: columnLigands.get(normalizedLigand) || ligandPart,
      beadCode,
      beadType: beadTypeNames[beadCode] || '',
      coreshellPresent: beadCode ? (beadCode === 'R' ? 'Yes' : 'No') : ''
    };
  }

  function inspectRunFilename(filename) {
    const originalFilename = String(filename ?? '');
    if (!/\.csv$/i.test(originalFilename)) {
      return { ok: false, status: 'UNSUPPORTED_FILE', message: 'Filename metadata parsing is available for CSV files only.' };
    }

    const baseName = originalFilename.split(/[\\/]/).pop();
    const stem = baseName.replace(/\.csv$/i, '').replace(/\s*\(\d+\)\s*$/, '');
    const parts = stem.split('-');
    const blankSampleType = identifyBlankSampleType(parts);
    if (blankSampleType) {
      return {
        ok: false,
        status: 'BLANK_RUN',
        sampleType: blankSampleType,
        originalFilename,
        message: 'ALERT: A BLK (blank) run was imported; please amend and import a Sample run file for analysis to occur.'
      };
    }

    const groupMatch = parts[0].match(/^GR(\d+)$/i);
    const runNumber = parts[1];
    const pH = parseNumber(parts[2]);
    const solventToken = (parts[3] ?? '').trim().toUpperCase();
    const solventType = solventToken === 'MEOH' ? 'MeOH' : (parts[3] ?? '').trim();
    const methodMetadata = parts[4];
    const mode = (parts[5] ?? '').trim().toUpperCase();
    const percentB = parseNumber(parts[6]);
    const flowRate = parseNumber(parts[7]);
    const injectionMatch = (parts[8] ?? '').match(/^(\d+(?:\.\d+)?)\s*(?:uL?|µL?)?$/i);
    const sampleType = (parts[9] ?? '').trim();
    const sampleConcentration = parseNumber(parts[10]);
    const dimensionsPattern = /^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)$/i;
    const dimensionIndexes = [];
    for (let index = 11; index < parts.length - 2; index += 1) {
      if (dimensionsPattern.test((parts[index] ?? '').trim())) dimensionIndexes.push(index);
    }
    const dimensionsIndex = dimensionIndexes.length === 1 ? dimensionIndexes[0] : -1;
    const columnIdentifier = dimensionsIndex > 11 ? parts.slice(11, dimensionsIndex).join('-') : '';
    const columnProperties = parseColumnIdentifier(columnIdentifier);
    const dimensionsMatch = dimensionsIndex >= 0 ? parts[dimensionsIndex].trim().match(dimensionsPattern) : null;
    const dimensions = dimensionsMatch ? dimensionsMatch.slice(1).map(Number) : null;
    const temperatureToken = dimensionsIndex >= 0 ? (parts[dimensionsIndex + 1] ?? '').trim() : '';
    const rawWavelengthToken = dimensionsIndex >= 0 ? (parts[dimensionsIndex + 2] ?? '').trim() : '';
    const wavelengthPrefixMatch = rawWavelengthToken.match(/^(PDA|\d+(?:\.\d+)?)/i);
    const wavelengthToken = wavelengthPrefixMatch ? wavelengthPrefixMatch[1] : rawWavelengthToken;
    const temperatureIsAmbient = /^amb$/i.test(temperatureToken ?? '');
    const prefixedTemperatureMatch = temperatureToken.match(/^T\s*(\d+(?:\.\d+)?)$/i);
    const temperatureC = temperatureIsAmbient ? 25 : prefixedTemperatureMatch ? parseNumber(prefixedTemperatureMatch[1]) : parseNumber(temperatureToken);
    const wavelengthIsPda = /^PDA$/i.test(wavelengthToken ?? '');
    const wavelengthNm = wavelengthIsPda ? null : parseNumber(wavelengthToken);
    const missingConditionFields = [];
    if (!columnProperties.beadType) missingConditionFields.push('Bead type');
    if (!columnProperties.ligand) missingConditionFields.push('Ligand');

    const valid = Boolean(
      parts.length >= 14 && groupMatch && /^\d+$/.test(runNumber) && Boolean((parts[2] ?? '').trim()) &&
      Boolean(solventToken) && Boolean(methodMetadata?.trim()) && Boolean(mode) && Boolean((parts[6] ?? '').trim()) &&
      Boolean((parts[7] ?? '').trim()) && Boolean((parts[8] ?? '').trim()) &&
      Boolean(sampleType?.trim()) && !/^(BLK|BLANK)$/i.test(sampleType.trim()) && Boolean((parts[10] ?? '').trim()) &&
      dimensions && dimensions.every((value) => value > 0) &&
      Boolean(temperatureToken) && Boolean(wavelengthToken)
    );

    if (!valid) {
      return { ok: false, status: 'INVALID_FILENAME', originalFilename, message: 'Filename metadata could not be interpreted reliably. Check the run-name components; values were not shifted into other fields.' };
    }

    return {
      ok: true,
      originalFilename,
      missingConditionFields,
      missingConditionFields,
      metadata: {
        groupIdentifier: parts[0],
        injectionRunIdentifier: runNumber,
        pH: pH ?? (parts[2] ?? '').trim(),
        mode,
        methodMetadata,
        sampleType,
        columnIdentifier,
        beadCode: columnProperties.beadCode,
        temperatureToken: temperatureC !== null ? String(temperatureC) : temperatureToken,
        wavelengthToken
      },
      conditions: {
        ligand: columnProperties.ligand,
        beadType: columnProperties.beadType,
        coreshellPresent: columnProperties.coreshellPresent,
        columnIdentifier,
        pH: pH ?? (parts[2] ?? '').trim(),
        solventType,
        percentB: percentB ?? (parts[6] ?? '').trim(),
        flowRateMlMin: flowRate ?? (parts[7] ?? '').trim(),
        injectionVolumeUl: injectionMatch ? Number(injectionMatch[1]) : (parts[8] ?? '').trim(),
        sampleConcentrationMgMl: sampleConcentration ?? (parts[10] ?? '').trim(),
        columnLengthMm: dimensions[0],
        columnInternalDiameterMm: dimensions[1],
        particleSizeUm: dimensions[2],
        temperatureC,
        temperatureDisplay: temperatureIsAmbient ? 'amb (25°C)' : temperatureC !== null ? `${temperatureC} °C` : temperatureToken,
        wavelengthNm,
        wavelengthDisplay: wavelengthIsPda ? 'PDA (pending CSV wavelength lookup)' : wavelengthNm !== null ? String(wavelengthNm) : wavelengthToken
      },
      needsPdaWavelength: wavelengthIsPda
    };
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let insideQuotes = false;
    const source = String(text ?? '');

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') {
        if (insideQuotes && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (character === ',' && !insideQuotes) {
        row.push(cell);
        cell = '';
      } else if ((character === '\n' || character === '\r') && !insideQuotes) {
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += character;
      }
    }

    if (insideQuotes) return { ok: false, message: 'The CSV appears malformed: a quoted value was not closed.' };
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    if (!rows.length || rows.every((currentRow) => currentRow.every((value) => !value.trim()))) {
      return { ok: false, message: 'The CSV file is empty.' };
    }
    return { ok: true, rows };
  }

  function parseWavelengthValue(rows) {
    for (const row of rows) {
      for (let column = 0; column < row.length; column += 1) {
        const label = row[column].trim().replace(/^\uFEFF/, '').toLowerCase().replace(/\s+/g, '');
        if (label !== 'wavelength(nm)') continue;
        for (let valueColumn = column + 1; valueColumn < row.length; valueColumn += 1) {
          const value = row[valueColumn].trim().match(/^(\d+(?:\.\d+)?)\s*(?:nm)?$/i);
          if (value) {
            const wavelength = Number(value[1]);
            if (Number.isFinite(wavelength) && wavelength > 0) return wavelength;
          }
        }
      }
    }
    return null;
  }

  function parseSampleName(rows) {
    const sampleNameRow = findCellInColumnA(rows, (label) => label === 'sample name');
    if (sampleNameRow < 0) return '';
    return String(rows[sampleNameRow]?.[1] ?? '').trim();
  }

  function parseDataFileName(rows) {
    const rawValue = String(rows[3]?.[1] ?? '').trim();
    if (!rawValue) return '';
    const pathMatch = rawValue.match(/[\\/]GR\d+[\\/]([^\\/]+)$/i);
    return (pathMatch ? pathMatch[1] : rawValue).trim();
  }

  function compareRunSources(sourceA, sourceB, sourceNameA, sourceNameB) {
    if (!sourceA?.metadata || !sourceB?.metadata) return [];
    const fields = [
      ['metadata.groupIdentifier', 'Group number'],
      ['metadata.injectionRunIdentifier', 'run/injection number'],
      ['metadata.pH', 'pH'],
      ['metadata.mode', 'mode'],
      ['metadata.methodMetadata', 'method metadata'],
      ['metadata.sampleType', 'sample type'],
      ['metadata.temperatureToken', 'temperature'],
      ['metadata.wavelengthToken', 'wavelength'],
      ['conditions.solventType', 'solvent'],
      ['conditions.ligand', 'ligand'],
      ['conditions.beadType', 'bead type'],
      ['conditions.percentB', '%B'],
      ['conditions.flowRateMlMin', 'flow rate'],
      ['conditions.injectionVolumeUl', 'injection volume'],
      ['conditions.sampleConcentrationMgMl', 'sample concentration'],
      ['conditions.columnLengthMm', 'column length'],
      ['conditions.columnInternalDiameterMm', 'column internal diameter'],
      ['conditions.particleSizeUm', 'particle size']
    ];
    const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
    const readValue = (source, path) => path.split('.').reduce((value, key) => value?.[key], source);
    const isC18AqEquivalent = (first, second) => {
      const normalizeColumn = (value) => normalize(value).replace(/[-_\s]+/g, '');
      const firstValue = normalizeColumn(first);
      const secondValue = normalizeColumn(second);
      return (firstValue === 'C18P' && secondValue === 'C18AQP') ||
        (firstValue === 'C18AQP' && secondValue === 'C18P') ||
        (firstValue === 'C18' && secondValue === 'C18AQ') ||
        (firstValue === 'C18AQ' && secondValue === 'C18');
    };
    const isPdaWavelengthEquivalent = (first, second) => {
      const firstValue = normalize(first);
      const secondValue = normalize(second);
      return (firstValue === 'PDA' && /^\d+(?:\.\d+)?$/.test(secondValue)) ||
        (secondValue === 'PDA' && /^\d+(?:\.\d+)?$/.test(firstValue));
    };
    return fields
      .filter(([path]) => {
        const firstValue = readValue(sourceA, path);
        const secondValue = readValue(sourceB, path);
        return normalize(firstValue) && normalize(secondValue) && normalize(firstValue) !== normalize(secondValue) &&
          !(path === 'conditions.ligand' && isC18AqEquivalent(firstValue, secondValue)) &&
          !(path === 'metadata.wavelengthToken' && isPdaWavelengthEquivalent(firstValue, secondValue));
      })
      .map(([path, label]) => {
        const firstValue = readValue(sourceA, path);
        const secondValue = readValue(sourceB, path);
        return `${label} (${firstValue} vs ${secondValue})`;
      });
  }

  function compareFilenameIdentity(filenameA, filenameB) {
    const getIdentity = (filename) => {
      const stem = String(filename ?? '').split(/[\\/]/).pop().replace(/\.(?:csv|xlsx)$/i, '');
      const parts = stem.split('-');
      return { group: parts[0], run: parts[1] };
    };
    const first = getIdentity(filenameA);
    const second = getIdentity(filenameB);
    const labels = [];
    if (/^GR\d+$/i.test(first.group) && /^GR\d+$/i.test(second.group) && first.group.toUpperCase() !== second.group.toUpperCase()) labels.push(`Group number (${first.group.replace(/^GR/i, '')} vs ${second.group.replace(/^GR/i, '')})`);
    if (/^\d+$/.test(first.run || '') && /^\d+$/.test(second.run || '') && first.run !== second.run) labels.push(`run/injection number (${first.run} vs ${second.run})`);
    return labels;
  }

  function formatDiscrepancyMessage(labels, sourceNameA, sourceNameB) {
    const labelText = labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
    return `A discrepancy was found between the ${labelText} in the ${sourceNameA} and ${sourceNameB} within the file; you may either manually change the imported values in the ‘Current Run’ panel, or rename the file correctly and re-upload it in ‘File Upload’ panel.`;
  }

  function collectDiscrepancyMessages(uploadedFilename, dataFilename, sampleResult, sampleFilename) {
    const discrepancyLabels = new Set();
    const comparisonFilename = String(uploadedFilename).replace(/\.xlsx$/i, '.csv');
    const uploadedResult = inspectRunFilename(comparisonFilename);
    const uploadedSourceLabel = 'File name';
    const directUploadedLabels = compareFilenameIdentity(uploadedFilename, sampleFilename);
    directUploadedLabels.forEach((label) => discrepancyLabels.add(label));
    if (uploadedResult.ok && sampleResult?.ok) {
      compareRunSources(uploadedResult, sampleResult, uploadedSourceLabel, 'Sample name').forEach((label) => discrepancyLabels.add(label));
    }
    if (dataFilename) {
      const dataResultParsed = inspectRunFilename(dataFilename);
      if (dataResultParsed.ok && sampleResult?.ok) {
        compareRunSources(dataResultParsed, sampleResult, 'Data file name', 'Sample name').forEach((label) => discrepancyLabels.add(label));
        if (uploadedResult.ok) {
          compareRunSources(uploadedResult, dataResultParsed, uploadedSourceLabel, 'Data file name').forEach((label) => discrepancyLabels.add(label));
        }
      }
    }
    const directDataLabels = compareFilenameIdentity(dataFilename, sampleFilename);
    directDataLabels.forEach((label) => discrepancyLabels.add(label));
    if (!discrepancyLabels.size) return [];
    const sourceText = `${uploadedSourceLabel}/Data file name`;
    return [formatDiscrepancyMessage([...discrepancyLabels], sourceText, 'Sample name')];
  }

  function preferAqColumnSource(filenameResult, uploadedFilename, dataFilename, sampleFilename) {
    const candidates = [uploadedFilename, dataFilename, sampleFilename]
      .filter(Boolean)
      .map((name) => inspectRunFilename(name))
      .filter((result) => result.ok && /C18[-_\s]*AQ/i.test(result.metadata.columnIdentifier));
    const preferred = candidates[0];
    if (!preferred) return;
    filenameResult.metadata.columnIdentifier = preferred.metadata.columnIdentifier;
    filenameResult.metadata.beadCode = preferred.metadata.beadCode;
    filenameResult.conditions.ligand = preferred.conditions.ligand;
    filenameResult.conditions.beadType = preferred.conditions.beadType;
    filenameResult.conditions.coreshellPresent = preferred.conditions.coreshellPresent;
    filenameResult.conditions.columnIdentifier = preferred.conditions.columnIdentifier;
  }

  function preferPdaWavelengthSource(filenameResult, uploadedFilename, dataFilename, sampleFilename) {
    const candidates = [uploadedFilename, dataFilename, sampleFilename]
      .filter(Boolean)
      .map((name) => inspectRunFilename(String(name).replace(/\.xlsx$/i, '.csv')))
      .filter((result) => result.ok);
    const pdaSource = candidates.find((result) => /^PDA$/i.test(result.metadata.wavelengthToken));
    if (!pdaSource) return;
    const numericSource = candidates.find((result) => Number.isFinite(result.conditions.wavelengthNm));
    filenameResult.needsPdaWavelength = true;
    filenameResult.metadata.wavelengthToken = 'PDA';
    filenameResult.conditions.wavelengthDisplay = 'PDA (pending CSV wavelength lookup)';
    filenameResult.pdaFallbackWavelengthNm = numericSource?.conditions.wavelengthNm ?? null;
  }

  function normalizeCsvLabel(value) {
    return String(value ?? '').trim().replace(/^\uFEFF/, '').replace(/\s+/g, ' ').toLowerCase();
  }

  function isSectionHeading(value) {
    return /^\s*\[[^\]]+\]\s*$/.test(String(value ?? '').replace(/^\uFEFF/, ''));
  }

  function findSectionEnd(rows, startIndex) {
    for (let index = startIndex + 1; index < rows.length; index += 1) {
      if (isSectionHeading(rows[index]?.[0])) return index;
    }
    return rows.length;
  }

  function findCellInColumnA(rows, predicate) {
    for (let index = 0; index < rows.length; index += 1) {
      if (predicate(normalizeCsvLabel(rows[index]?.[0]))) return index;
    }
    return -1;
  }

  function numericCell(value) {
    const trimmed = String(value ?? '').trim().replace(/,/g, '');
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
    const valueNumber = Number(trimmed);
    return Number.isFinite(valueNumber) ? valueNumber : null;
  }

  function parsePumpAPressure(rows) {
    const sectionStart = findCellInColumnA(rows, (label) => label === '[lc status trace(pump a pressure)]');
    if (sectionStart < 0) return null;
    const sectionEnd = findSectionEnd(rows, sectionStart);
    let multiplier = null;
    let headerIndex = -1;

    for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
      const row = rows[index] || [];
      const first = normalizeCsvLabel(row[0]);
      if (first === 'intensity multiplier') multiplier = numericCell(row[1]);
      if (first === 'r.time (min)' && normalizeCsvLabel(row[1]) === 'intensity') {
        headerIndex = index;
        break;
      }
    }

    if (headerIndex < 0 || multiplier === null) return null;
    const pressureValues = [];
    for (let index = headerIndex + 1; index < sectionEnd; index += 1) {
      const row = rows[index] || [];
      const retentionTime = numericCell(row[0]);
      const intensity = numericCell(row[1]);
      if (retentionTime === null || intensity === null) continue;
      pressureValues.push(intensity);
    }
    if (!pressureValues.length) return null;
    const average = pressureValues.reduce((sum, value) => sum + value, 0) / pressureValues.length;
    return { backPressurePsi: average * multiplier, pressurePointCount: pressureValues.length, intensityMultiplier: multiplier };
  }

  function parsePeakTable(rows) {
    const sectionStart = findCellInColumnA(rows, (label) => /^\[peak table\((?:detector a|pda-ch1)\)/.test(label));
    if (sectionStart < 0) return null;
    const sectionEnd = findSectionEnd(rows, sectionStart);
    let declaredPeakCount = null;
    let headerIndex = -1;
    let headerRow = null;

    for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
      const row = rows[index] || [];
      if (normalizeCsvLabel(row[0]) === '# of peaks') {
        for (let column = 1; column < row.length; column += 1) {
          const count = numericCell(row[column]);
          if (count !== null && Number.isInteger(count) && count >= 0) {
            declaredPeakCount = count;
            break;
          }
        }
      }
      const normalizedHeaders = row.map(normalizeCsvLabel);
      if (normalizedHeaders.includes('peak#') && normalizedHeaders.includes('r.time')) {
        headerIndex = index;
        headerRow = row;
        break;
      }
    }
    if (headerIndex < 0 || !headerRow) return null;

    const headerNames = headerRow.map((header, index) => String(header ?? '').trim() || `Column ${index + 1}`);
    const normalizedHeaders = headerNames.map(normalizeCsvLabel);
    const peakNumberColumn = normalizedHeaders.indexOf('peak#');
    const retentionColumn = normalizedHeaders.indexOf('r.time');
    const resolutionColumn = normalizedHeaders.indexOf('resolution');
    const areaColumn = normalizedHeaders.findIndex((header) => header === 'area' || /^area\s*\(auc\)?$/.test(header));
    const heightColumn = normalizedHeaders.findIndex((header) => /^height(?:\s*\(.*\))?$/.test(header));
    const peaks = [];
    const excludedArtifactPeaks = [];
    let excludedArtifactCount = 0;

    for (let index = headerIndex + 1; index < sectionEnd; index += 1) {
      const row = rows[index] || [];
      const peakNumber = numericCell(row[peakNumberColumn]);
      const retentionTime = numericCell(row[retentionColumn]);
      if (peakNumber === null || !Number.isInteger(peakNumber) || retentionTime === null) continue;
      const area = areaColumn < 0 ? null : numericCell(row[areaColumn]);
      if (area !== null && area <= 10000) {
        excludedArtifactCount += 1;
        excludedArtifactPeaks.push({ peakNumber, retentionTimeMin: retentionTime, area, height: heightColumn < 0 ? null : numericCell(row[heightColumn]) });
        continue;
      }
      const height = heightColumn < 0 ? null : numericCell(row[heightColumn]);
      const resolution = resolutionColumn < 0 ? null : numericCell(row[resolutionColumn]);
      const properties = {};
      headerNames.forEach((header, column) => {
        const rawValue = String(row[column] ?? '').trim();
        if (!rawValue) return;
        const parsedValue = numericCell(rawValue);
        properties[header] = parsedValue === null ? rawValue : parsedValue;
      });
      peaks.push({ peakNumber, retentionTimeMin: retentionTime, resolution, area, height, properties });
    }
    if (!peaks.length && excludedArtifactCount === 0) return null;

    let worstPair = null;
    if (resolutionColumn >= 0) {
      for (let index = 0; index < peaks.length; index += 1) {
        const peak = peaks[index];
        if (peak.peakNumber === 1) continue;
        const resolution = peak.resolution;
        if (resolution === null || resolution <= 0) continue;
        const previousPeak = peaks[index - 1];
        if (!previousPeak) continue;
        if (!worstPair || resolution < worstPair.resolution) {
          worstPair = { resolution, firstPeakNumber: previousPeak.peakNumber, secondPeakNumber: peak.peakNumber };
        }
      }
    }

    return {
      peakCount: excludedArtifactCount > 0 ? peaks.length : declaredPeakCount ?? peaks.length,
      declaredPeakCount,
      validPeakRowCount: peaks.length,
      peakCountMatchesPeakRows: declaredPeakCount === null ? null : declaredPeakCount === peaks.length,
      lastPeakRetentionTimeMin: peaks.length ? peaks[peaks.length - 1].retentionTimeMin : null,
      worstPairResolution: peaks.length === 1 ? 0 : worstPair?.resolution ?? null,
      excludedArtifactPeaks,
      worstPairPeaks: worstPair ? [worstPair.firstPeakNumber, worstPair.secondPeakNumber] : null,
      peaks,
      peakTableHeaders: headerNames
    };
  }

  function parseChromatographicResults(rows) {
    return {
      ...(parsePeakTable(rows) || { peakCount: null, declaredPeakCount: null, validPeakRowCount: 0, peakCountMatchesPeakRows: null, lastPeakRetentionTimeMin: null, worstPairResolution: null, worstPairPeaks: null, peaks: [], peakTableHeaders: [] }),
      ...(parsePumpAPressure(rows) || { backPressurePsi: null, pressurePointCount: 0, intensityMultiplier: null })
    };
  }

  async function parseRunCsvFile(file) {
    const uploadedFilename = String(file?.name ?? '');
    const isXlsx = /\.xlsx$/i.test(uploadedFilename);
    if (!/\.(?:csv|xlsx)$/i.test(uploadedFilename)) {
      return { ok: false, status: 'UNSUPPORTED_FILE', originalFilename: uploadedFilename, message: 'Run import requires a .csv or .xlsx file.' };
    }

    let text;
    try {
      text = isXlsx ? await app.convertXlsxToCsv(file) : await file.text();
    } catch {
      return { ok: false, status: 'INVALID_FILE', originalFilename: uploadedFilename, message: `The ${isXlsx ? 'XLSX' : 'CSV'} file could not be read or converted.` };
    }

    const csv = parseCsvRows(text);
    if (!csv.ok) return { ok: false, status: 'INVALID_FILE', originalFilename: uploadedFilename, message: csv.message };

    const chromatographicResults = parseChromatographicResults(csv.rows);
    const embeddedSampleName = parseSampleName(csv.rows);
    const embeddedDataFilename = parseDataFileName(csv.rows);
    const uploadedMetadataFilename = uploadedFilename.replace(/\.xlsx$/i, '.csv');
    const filenameResult = inspectRunFilename(uploadedMetadataFilename);
    if (filenameResult.status === 'BLANK_RUN') {
      return { ...filenameResult, originalFilename: uploadedFilename, uploadedFilename, sampleName: embeddedSampleName, results: chromatographicResults };
    }
    if (!filenameResult.ok) {
      return {
        ...filenameResult,
        originalFilename: uploadedFilename,
        uploadedFilename,
        sampleName: embeddedSampleName,
        results: chromatographicResults,
        message: `The uploaded file name is invalid: ${filenameResult.message}`
      };
    }
    const embeddedFilename = embeddedSampleName
      ? `${embeddedSampleName.replace(/[\\/]+$/, '')}${/\.csv$/i.test(embeddedSampleName) ? '' : '.csv'}`
      : '';
    const sampleNameResult = embeddedFilename ? inspectRunFilename(embeddedFilename) : null;
    filenameResult.originalFilename = uploadedFilename;
    filenameResult.uploadedFilename = uploadedFilename;
    filenameResult.sampleName = embeddedSampleName;
    filenameResult.dataFilename = embeddedDataFilename;
    filenameResult.metadataSourceName = uploadedFilename;
    filenameResult.discrepancyMessages = collectDiscrepancyMessages(uploadedFilename, embeddedDataFilename, sampleNameResult, embeddedFilename);
    preferAqColumnSource(filenameResult, uploadedFilename, embeddedDataFilename, embeddedFilename);
    preferPdaWavelengthSource(filenameResult, uploadedFilename, embeddedDataFilename, embeddedFilename);

    let metadataWarning = '';
    if (filenameResult.needsPdaWavelength) {
      const wavelengthNm = parseWavelengthValue(csv.rows);
      const resolvedWavelength = wavelengthNm ?? filenameResult.pdaFallbackWavelengthNm;
      if (resolvedWavelength === null || resolvedWavelength === undefined) {
        metadataWarning = 'The uploaded file name specifies PDA, but no value associated with Wavelength (nm) was found in the file. Enter the wavelength manually.';
        filenameResult.conditions.wavelengthDisplay = '';
      } else {
        filenameResult.conditions.wavelengthNm = resolvedWavelength;
        filenameResult.conditions.wavelengthDisplay = `PDA (${resolvedWavelength})`;
        filenameResult.metadata.wavelengthNm = resolvedWavelength;
      }
    }

    return { ...filenameResult, csvRows: csv.rows, results: chromatographicResults, metadataWarning };
  }

  app.inspectRunFilename = inspectRunFilename;
  app.parseRunCsvFile = parseRunCsvFile;
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});
