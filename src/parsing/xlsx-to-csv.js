(function (app) {
  const decoder = new TextDecoder();

  function readUint16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint32(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  }

  function findEndOfCentralDirectory(bytes) {
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
      if (readUint32(bytes, offset) === 0x06054b50) return offset;
    }
    return -1;
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch {
        // Some browsers expose DecompressionStream without supporting deflate-raw.
      }
    }
    if (typeof window.fflate?.inflateSync === 'function') return window.fflate.inflateSync(bytes);
    throw new Error('This browser does not support XLSX compression.');
  }

  async function unzip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const end = findEndOfCentralDirectory(bytes);
    if (end < 0) throw new Error('The XLSX archive could not be opened.');
    const entryCount = readUint16(bytes, end + 10);
    const centralOffset = readUint32(bytes, end + 16);
    const files = new Map();
    let offset = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
      if (readUint32(bytes, offset) !== 0x02014b50) throw new Error('The XLSX archive has an invalid directory.');
      const compression = readUint16(bytes, offset + 10);
      const compressedSize = readUint32(bytes, offset + 20);
      const nameLength = readUint16(bytes, offset + 28);
      const extraLength = readUint16(bytes, offset + 30);
      const commentLength = readUint16(bytes, offset + 32);
      const localOffset = readUint32(bytes, offset + 42);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      if (name.endsWith('/')) {
        offset += 46 + nameLength + extraLength + commentLength;
        continue;
      }
      if (readUint32(bytes, localOffset) !== 0x04034b50) throw new Error('The XLSX archive has an invalid file entry.');
      const localNameLength = readUint16(bytes, localOffset + 26);
      const localExtraLength = readUint16(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      files.set(name, compression === 0 ? compressed : await inflate(compressed));
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return files;
  }

  function xmlFile(files, name) {
    const bytes = files.get(name);
    if (!bytes) return null;
    return new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml');
  }

  function xmlText(node) {
    return Array.from(node?.querySelectorAll('t') || []).map((item) => item.textContent || '').join('');
  }

  function columnIndex(reference) {
    const letters = String(reference).match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A';
    return Array.from(letters).reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function worksheetPath(files) {
    const workbook = xmlFile(files, 'xl/workbook.xml');
    const relationships = xmlFile(files, 'xl/_rels/workbook.xml.rels');
    const sheet = workbook?.querySelector('sheet');
    const relationId = sheet?.getAttribute('r:id');
    const relation = Array.from(relationships?.querySelectorAll('Relationship') || []).find((item) => item.getAttribute('Id') === relationId);
    const target = relation?.getAttribute('Target') || 'worksheets/sheet1.xml';
    return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }

  async function convertXlsxToCsv(file) {
    const files = await unzip(await file.arrayBuffer());
    const sharedStrings = Array.from(xmlFile(files, 'xl/sharedStrings.xml')?.querySelectorAll('si') || []).map(xmlText);
    const worksheet = xmlFile(files, worksheetPath(files));
    if (!worksheet) throw new Error('No worksheet was found in the XLSX file.');
    const rows = [];
    for (const row of worksheet.querySelectorAll('sheetData > row')) {
      const values = [];
      for (const cell of row.querySelectorAll(':scope > c')) {
        const index = columnIndex(cell.getAttribute('r'));
        const type = cell.getAttribute('t');
        const value = type === 'inlineStr'
          ? xmlText(cell)
          : type === 's'
            ? sharedStrings[Number(cell.querySelector('v')?.textContent)] || ''
            : cell.querySelector('v')?.textContent || '';
        values[index] = value;
      }
      rows.push(values.map((value) => csvEscape(value)).join(','));
    }
    return rows.join('\r\n');
  }

  app.convertXlsxToCsv = convertXlsxToCsv;
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});
