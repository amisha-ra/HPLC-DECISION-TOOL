(function (app) {
const moduleNames = [
  'Solvents',
  'Degasser',
  'Pump',
  'Injector / Autosampler',
  'Column',
  'Column Oven',
  'PDA / UV Detector',
  'Waste'
];

const solventModuleInformation = {
  function: `The solvents form the mobile phase that carries the injected sample through the HPLC system and the column. Changing the identity or proportion of the organic solvent changes the strength and chemical properties of the mobile phase, which influences how strongly analytes are retained by the stationary phase in the column.`,
  controlPoint: `Solvent identity and mobile phase composition, including the proportion of organic solvent represented as %B.`,
  whatCanAlter: `The organic solvent type can be changed, for example between acetonitrile (ACN) and methanol (MeOH), and the proportion of organic solvent in the mobile phase can be adjusted as %B (percent of organic solvent). For the configured reversed-phase HPLC method, mobile phase A is the aqueous solvent and mobile phase B is the organic solvent.\n\nDecreasing %B increases the proportion of aqueous phase relative to organic phase, while increasing %B increases the proportion of organic phase. %B is primarily altered to control retention, while changing the organic solvent is implemented as a change in selectivity.`,
  chromatographicEffects: `Increasing %B increases mobile phase elution strength, so analytes generally spend less time interacting with the stationary phase and elute sooner. Decreasing %B generally increases retention, as analytes interact more with the stationary phase.\n\nChanging the organic solvent type can alter the relative interactions of individual analytes with the mobile and stationary phases. Therefore, ACN and MeOH can produce different selectivity even when their solvent strengths are adjusted to comparable conditions.`,
  chromatogramEffect: `Changing %B primarily changes peak retention times, where as the %B is decreased, peaks shift to longer retention times. Individual analytes may respond differently to changes in mobile phase composition, therefore peak spacing may also change.\n\nChanging the organic solvent type can alter the relative spacing and potentially the elution order of peaks. As a result, peaks that previously co-eluted may separate, while previously separated peaks may move closer together.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const degasserModuleInformation = {
  function: `The degasser removes dissolved gases from the mobile phase before the solvents reach the pump. Dissolved gases can come out of solution as bubbles when pressure, temperature or solvent composition changes. Removing these gases helps maintain a continuous, stable mobile phase flow and reduces interference caused by bubbles elsewhere in the system. Inference caused by bubbles may include pump disruption, unstable mobile phase flow, and detector baseline noise.`,
  controlPoint: `The degasser and solvent lines passing through it; the appropriate solvent lines must pass through the degasser and the degassing system must be functioning correctly.`,
  whatCanAlter: `The degasser is primarily a system support module, so it is not normally adjusted to deliberately change retention, selectivity or efficiency. The main requirement is that the appropriate solvent lines pass through the degasser and that the degassing system is functioning correctly.`,
  chromatographicEffects: `This module is not changed to alter chromatographic outcomes; it is a system support module. The degasser primarily supports reliable and reproducible operation rather than directly controlling chromatographic retention, selectivity, or efficiency.`,
  chromatogramEffect: `With effective degassing, the chromatogram should have a more stable baseline and reproducible retention behaviour because mobile phase delivery and detector operation remain stable. Inadequate degassing or bubbles in the system can cause baseline noise or disturbances, unstable detector response and inconsistent solvent delivery, potentially reducing the reproducibility and reliability of the chromatogram.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const injectorModuleInformation = {
  function: `The injector/autosampler introduces a precise and reproducible volume of the prepared sample into the flowing mobile phase, allowing the sample to enter the HPLC system through the injection system/loop, before reaching the column. There are two types; manual injectors or autosamplers. A system with a manual injector requires the user to manually inject the sample through a syringe, whereas an autosampler draws the sample from the vial placed in a vial in the autosampler hardware module. In a manual injector, the sample is introduced through the injection valve and sample loop, whereas an autosampler performs the injection automatically according to the programmed sequence and injection settings.`,
  controlPoint: `The injection system/loop or autosampler hardware module, including the programmed sequence and injection settings where applicable.`,
  whatCanAlter: `Injection volume (uL), sample concentration (mg/mL), sample preparation and where available, needle/seat wash settings can be altered. Note that the available injection volume may be constrained by the autosampler and sample loop configuration. Together, injection volume and sample concentration determine the amount of sample loaded onto the column.`,
  chromatographicEffects: `Increasing the injection volume or sample concentration increases the amount of analyte introduced onto the column and generally increases detector response. Note that excessive sample loading can overload the column, potentially causing peak broadening or distortion and reducing chromatographic resolution and efficiency. Inappropriate sample solvent or excessive injection volume can also distort peaks. The injector/autosampler primarily controls sample introduction and loading rather than being used to deliberately alter chromatographic retention or selectivity.`,
  chromatogramEffect: `Increasing the amount of sample injected generally increases peak height and/or peak area. Excess sample loading may produce broader, asymmetric or fronting peaks, which can decrease efficiency and reduce resolution. Carryover may produce unexpected peaks in subsequent blank or sample injections.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const pumpModuleInformation = {
  function: `The pump imposes and delivers the mobile phase at a controlled and reproducible flow rate. Back-pressure is produced as resistance to this flow, particularly from the packed column, and is detected by the pressure sensor in the system.`,
  controlPoint: `Flow rate; depending on the configured pump system, the proportions of mobile phases used to produce the required %B.`,
  whatCanAlter: `The pump system controls the flow rate, and depending on the pump configuration also controls the proportions of mobile phases used to produce the required %B:\n\n1. Binary gradient system with two pumps → separate pumps deliver two mobile phases, with one supplying mobile phase A and the other mobile phase B, and their flows are combined in the required proportions.\n\n2. Single pump system with a quaternary proportioning valve → the proportioning valve can proportion up to 4 solvents from various solvent lines, and these are mixed prior to the pump, where the pump delivers the mixed mobile phase.\n\nThe available flow rate and solvent-proportioning capabilities are constrained by the particular pump system and method configuration.`,
  whatCanAlterBoldPhrases: [
    'Binary gradient system with two pumps',
    'Single pump system with a quaternary proportioning valve'
  ],
  chromatographicEffects: `Flow rate: Increasing flow rate decreases retention time and run time but increases backpressure and can affect column efficiency since efficiency depends on mobile phase linear velocity. Decreasing flow rate has the opposite effect; generally increasing retention times and reducing backpressure.\n\n%B: In reversed-phase HPLC, increasing %B increases elution strength and decreases retention, while decreasing %B increases retention. Individual analytes may respond differently to changes in mobile-phase composition, thus changing %B can also affect peak spacing.`,
  chromatogramEffect: `Increasing flow rate shifts peaks to shorter retention times and shortens the run, while decreasing flow rate shifts peaks to longer retention times. Efficiency, resolution and backpressure may also change.\n\nIncreasing %B generally shifts peaks to shorter retention times, while decreasing %B shifts them to longer retention times. Peak spacing and resolution may also change due to differences in analyte retention.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const columnModuleInformation = {
  function: `The column contains the stationary phase where chromatographic separation occurs. Analytes interact differently with the stationary and mobile phases based on their physicochemical properties, such as polarity and chemical structure, causing them to travel through the column at different rates and separate into individual peaks.`,
  controlPoint: `The stationary-phase column and its configured properties. The factor represented by ___ has not been specified.`,
  whatCanAlter: `Column properties can be changed to modify retention, selectivity, efficiency and pressure:\n\n1. Stationary phase chemistry (ligand) → changes the interactions between analytes and the stationary phase and therefore selectivity.\n\n2. Column length → longer columns generally provide greater efficiency and resolution but increase run time and backpressure.\n\n3. Particle size → smaller particles generally provide greater efficiency and resolution but increase backpressure.\n\n4. Internal diameter (ID) → affects mobile-phase linear velocity, solvent consumption and pressure for a given flow rate.\n\nThe available changes are limited by the columns available and the operating pressure of the HPLC system.`,
  whatCanAlterBoldPhrases: [
    'Stationary phase chemistry (ligand)',
    'Column length',
    'Particle size',
    'Internal diameter (ID)'
  ],
  chromatographicEffects: `Stationary phase: Changing ligand chemistry alters analyte and stationary phase interactions, changing selectivity, retention and peak spacing.\n\nColumn length: Increasing length generally increases efficiency and resolution, but also increases retention time and backpressure.\n\nParticle size: Decreasing particle size generally increases efficiency and can improve resolution, but increases backpressure.\n\nInternal diameter: Changing ID alters linear velocity at a given flow rate and can therefore affect retention, efficiency and backpressure.`,
  chromatographicEffectsBoldPhrases: ['Stationary phase:', 'Column length:', 'Particle size:', 'Internal diameter:'],
  chromatogramEffect: `Changing stationary phase chemistry can alter peak spacing and may change elution order. Increasing column length generally produces better separated peaks but a longer run.\n\nDecreasing particle size can produce narrower, better resolved peaks.\n\nChanging column ID can affect retention times and peak efficiency if the flow rate is not adjusted accordingly.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const columnOvenModuleInformation = {
  function: `The column oven maintains the column at a controlled and stable temperature during analysis. Controlling temperature provides reproducible chromatographic conditions and influences analyte interactions with the stationary and mobile phases.`,
  controlPoint: `Column temperature (°C), held constant throughout an isocratic run unless the method specifically uses temperature programming.`,
  whatCanAlter: `The column temperature (°C) can be adjusted within the operating range of the column and instrument. Temperature should remain constant throughout an isocratic run unless the method specifically uses temperature programming.`,
  chromatographicEffects: `Increasing temperature generally decreases mobile phase viscosity, reducing backpressure and often decreasing analyte retention. Temperature can also alter analyte-stationary phase interactions differently between compounds, thereby affecting selectivity and resolution. Temperature is a parameter modified within the Selectivity cycle. Note, decreasing temperature generally has the opposite effects.`,
  chromatogramEffect: `Changing column temperature can affect retention and selectivity, shifting retention times and changing peak spacing or resolution. It may also influence efficiency through changes in mass transfer and mobile phase viscosity.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const detectorModuleInformation = {
  function: `The detector detects analytes as they elute from the column by measuring their absorbance of UV/visible light at a selected wavelength/wavelengths. Changes in absorbance are converted into a signal and plotted against time to produce the chromatogram.`,
  controlPoint: `Detection wavelength (nm); detector type and configuration are not specified.`,
  whatCanAlter: `The detection wavelength (nm) can be selected based on the absorbance properties of the analytes. A UV detector typically monitors a specific selected wavelength, while a PDA detector measures absorbance at many wavelengths simultaneously across a wavelength range, allowing spectra to be obtained for individual peaks and chromatograms at different wavelengths to be analysed post-run.`,
  chromatographicEffects: `Changing wavelength affects detector response and sensitivity. Selecting a wavelength where an analyte absorbs strongly generally increases its peak response, while a wavelength with weak absorbance decreases the response. Different compounds may respond differently at the same wavelength.`,
  chromatogramEffect: `Changing the detection wavelength primarily changes peak height and area and may affect which peaks are detectable. It does not directly change retention, selectivity or column efficiency, because detection occurs after the analytes have already been separated by the column.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const wasteModuleInformation = {
  function: `The waste system safely collects the mobile phase, analytes and other liquid effluent after they have passed through the detector. Waste lines direct this liquid into an appropriate waste container for safe disposal.`,
  controlPoint: `Waste container and waste-line arrangement; the container and lines must be appropriate for the solvents and chemicals being used, have sufficient capacity, and have correctly positioned tubing.`,
  whatCanAlter: `Waste is not a chromatographic parameter. The waste container and waste line arrangement must be appropriate for the solvents and chemicals being used, with sufficient capacity and correctly positioned tubing.`,
  chromatographicEffects: `The waste system should not be altered to modify the chromatographic method. Waste lines should remain unobstructed and correctly connected to allow unrestricted drainage from the detector.`,
  chromatogramEffect: `Under normal operation, the waste system has no effect on retention, selectivity or column efficiency, as the mobile phase has already passed through the column and detector. A blocked or incorrectly configured waste line may disrupt system operation but is not used to control chromatographic separation.`,
  configurationStatus: 'PARTIALLY_CONFIGURED'
};

const methodParameters = [
  {
    parameterName: 'Solvent type', category: 'Chemical', units: '—', controllingModule: 'Solvents',
    availableRange: 'ACN, MeOH, or ACN/MeOH mixture',
    chromatographicEffect: 'Changes retention and selectivity and may alter peak spacing and elution order.'
  },
  {
    parameterName: '%B / mobile phase composition', category: 'Chemical', units: '%B', controllingModule: 'Solvents',
    availableRange: '0–100% B',
    chromatographicEffect: 'Increasing %B generally decreases retention (k and tR); decreasing %B generally increases retention and may separate co-eluting peaks.'
  },
  {
    parameterName: 'Flow rate', category: 'Mechanical', units: 'mL/min', controllingModule: 'Pump',
    availableRange: 'Instrument/column dependent – mL/min',
    chromatographicEffect: 'Increasing flow generally decreases tR, increases backpressure, and affects efficiency (N).'
  },
  {
    parameterName: 'Injection volume', category: 'Mechanical', units: 'µL', controllingModule: 'Injector / Autosampler',
    availableRange: 'Instrument/injector dependent – µL; common: 5–20 µL',
    chromatographicEffect: 'Excessive volume can cause peak broadening/overloading, reducing efficiency and resolution.'
  },
  {
    parameterName: 'Sample concentration', category: 'Chemical', units: 'mg/mL', controllingModule: 'Injector / Autosampler',
    availableRange: 'Sample/method dependent – mg/mL; typically 0.01–1.0 mg/mL',
    chromatographicEffect: 'Excessive concentration can cause column overloading and peak broadening, reducing efficiency and resolution.'
  },
  {
    parameterName: 'Ligand', category: 'Chemical', units: '—', controllingModule: 'Column',
    availableRange: 'Common ligands: C18, C18 AQ, C8, PFP, PFPP, BiPH, IBD – no units',
    chromatographicEffect: 'Changes retention and selectivity, potentially altering peak spacing and elution order.'
  },
  {
    parameterName: 'Bead type', category: 'Mechanical & Chemical', units: '—', controllingModule: 'Column',
    availableRange: 'Pinnacle DB, Ultra, Raptor, Force – no units',
    chromatographicEffect: 'Can affect efficiency, retention and selectivity, depending on particle and stationary-phase characteristics.'
  },
  {
    parameterName: 'Coreshell present', category: 'Mechanical', units: 'Yes / No', controllingModule: 'Column',
    availableRange: 'Yes / No',
    chromatographicEffect: 'Core-shell particles can increase efficiency (N) and potentially improve resolution.'
  },
  {
    parameterName: 'Pore size', category: 'Mechanical', units: 'Å', controllingModule: 'Column',
    availableRange: 'Column dependent – Å; common: 60 Å, 90 Å, 100 Å, 110 Å, 140 Å',
    chromatographicEffect: 'Can affect analyte access, mass transfer and efficiency, particularly for larger analytes.'
  },
  {
    parameterName: 'Carbon load', category: 'Chemical', units: '%', controllingModule: 'Column',
    availableRange: 'Column dependent – %',
    chromatographicEffect: 'Can affect retention and selectivity, particularly through changes in stationary-phase hydrophobicity.'
  },
  {
    parameterName: 'Column length', category: 'Mechanical', units: 'mm', controllingModule: 'Column',
    availableRange: 'Available column dependent – mm; common: 30, 50, 100, 150, 200, or 250 mm',
    chromatographicEffect: 'Increasing length generally increases efficiency (N), resolution, retention/run time and backpressure.'
  },
  {
    parameterName: 'Column internal diameter', category: 'Mechanical', units: 'mm', controllingModule: 'Column',
    availableRange: 'Available column dependent – mm; common: 2.1, 3, 4, or 4.6 mm',
    chromatographicEffect: 'Affects linear velocity, efficiency, solvent consumption and backpressure at a given volumetric flow.'
  },
  {
    parameterName: 'Particle size', category: 'Mechanical', units: 'µm', controllingModule: 'Column',
    availableRange: 'Available column dependent – µm; common: 1.8, 1.9, 2.7, 3, or 5 µm',
    chromatographicEffect: 'Decreasing particle size generally increases efficiency (N) and resolution, but also increases backpressure.'
  },
  {
    parameterName: 'Temperature', category: 'Mechanical & Chemical', units: '°C', controllingModule: 'Column Oven',
    availableRange: 'Instrument/method dependent – °C; common: ambient/25°C, 40°C, and 60°C; intermediate temperatures may be used',
    chromatographicEffect: 'Can change retention and selectivity; increasing temperature generally reduces mobile-phase viscosity and backpressure.'
  },
  {
    parameterName: 'Wavelength', category: 'Mechanical', units: 'nm', controllingModule: 'PDA / UV Detector',
    availableRange: 'Detector/analyte dependent – nm; common: 254 nm (standard PDA spectral acquisition range: 190–800 nm)',
    chromatographicEffect: 'Changes detector response, peak height and peak area, but does not directly affect the chromatographic separation.'
  }
];

const fileResponses = [
  { name: 'Peak count', units: 'peaks', source: 'The number of valid chromatographic peaks detected in the run; artefact peaks should be removed if present prior to uploading a file in this tool.' },
  { name: 'Peak retention time (tR)', units: 'min', source: 'Retention time of each valid peak, measured from injection to the peak apex. Used to identify the first peak (t₀) and last-eluting peak. For any run, an unretained marker such as Uracil should be included in the sample to establish t0 (the time taken for a compound that does not interact with the stationary phase to pass through the column).' },
  { name: 'Resolution values', units: 'Rmin', source: 'Resolution may also be represented by R, Rs, or Res. Resolution is a measure of how well two adjacent chromatographic peaks are separated from each other, and is calculated using the distance between two adjacent peaks and their width (using base width or half-height width). The higher the R value, the better the separation between the two peaks.' },
  { name: 'Backpressure', units: 'psi', source: 'Backpressure is the resistance to mobile phase flow through the HPLC system, observed as pressure generated when the pump forces mobile phase through the column.' },
];

const derivedResponses = [
  { name: 'Last-peak retention time', units: 'min', basis: 'Retention time (tR) of the final valid chromatographic peak. Represents the chromatographic run time used for comparison with the maximum run-time specification.' },
  { name: 'Worst-pair resolution (Rs,worst)', units: 'Rmin', basis: 'Lowest valid resolution between adjacent analyte peaks. Used to compare separation quality against the resolution specification. If the worst pair resolution is below the specification, the resolution of the whole chromatogram is regarded as \'0\'.' },
  { name: 'Min %B', units: '%', basis: 'Minimum %B (Min %B) is the lowest mobile-phase %B that can be used without the last peak exceeding the maximum permitted run time.' },
  { name: 'Retention factor (K)', units: 'unitless', basis: 'The retention factor is a measure of how strongly an analyte is retained by the column relative to an unretained compound, calculated from its retention time and the column dead time. It is utilised in calculating the minimum %B for a set of Retention runs.' },
  { name: 'Intermediate %B analysis', units: '%B', basis: 'Evaluates an intermediate mobile-phase composition between previously tested %B conditions when required to investigate peak separation before progressing to Selectivity.' }
];

app.createEquipmentReference = function createEquipmentReference() {
  return {
    modules: moduleNames.map((name, index) => ({
      id: `module-${index + 1}`,
      name,
      function: null,
      controlPoint: null,
      minimum: null,
      maximum: null,
      units: null,
      chromatographicEffects: null,
      chromatogramEffect: null,
      configurationStatus: 'NOT_CONFIGURED',
      ...(name === 'Solvents' ? solventModuleInformation : {}),
      ...(name === 'Degasser' ? degasserModuleInformation : {}),
      ...(name === 'Injector / Autosampler' ? injectorModuleInformation : {}),
      ...(name === 'Pump' ? pumpModuleInformation : {}),
      ...(name === 'Column' ? columnModuleInformation : {}),
      ...(name === 'Column Oven' ? columnOvenModuleInformation : {}),
      ...(name === 'PDA / UV Detector' ? detectorModuleInformation : {}),
      ...(name === 'Waste' ? wasteModuleInformation : {})
    })),
    parameters: methodParameters.map((parameter, index) => ({
      id: `parameter-${index + 1}`,
      ...parameter,
      currentValue: null,
      minimum: null,
      maximum: null,
      function: null,
      chromatographicEffects: null,
      configurationStatus: parameter.controllingModule ? 'PARTIALLY_CONFIGURED' : 'NOT_CONFIGURED'
    })),
    fileResponses: fileResponses.map((response) => ({ ...response })),
    derivedResponses: derivedResponses.map((response) => ({ ...response }))
  };
};
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});