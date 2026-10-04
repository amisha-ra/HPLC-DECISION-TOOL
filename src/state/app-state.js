(function (app) {
  const storageKey = 'hplc-decision-tool-user-state-v1';

  app.createAppState = function createAppState() {
    return {
    methodSpecifications: {
      targetPeakCount: 7,
      maximumRunTimeMin: 15,
      minimumResolutionRmin: 1.4,
      maximumBackpressurePsi: 4000
    },
    currentRun: null,
    multiFileBatchRunIds: [],
    methodDevelopmentState: null,
    runHistory: [],
    columnInformation: { description: '' },
    currentDecision: null,
    nextRunConditions: null,
    equipmentInformation: null,
    activeDashboardTab: 'run-review',
    allRunsImportedAtOnce: false
    };
  };

  app.restoreUserState = function restoreUserState(appState) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (!saved || typeof saved !== 'object') return;

      appState.methodSpecifications = {
        ...appState.methodSpecifications,
        ...(saved.methodSpecifications || {})
      };
      appState.runHistory = Array.isArray(saved.runHistory) ? saved.runHistory : [];
      appState.multiFileBatchRunIds = Array.isArray(saved.multiFileBatchRunIds) ? saved.multiFileBatchRunIds : [];
      appState.currentRun = saved.currentRun || null;
      if (appState.currentRun?.id) {
        appState.currentRun = appState.runHistory.find((run) => run.id === appState.currentRun.id) || appState.currentRun;
      }
      appState.columnInformation = {
        ...appState.columnInformation,
        ...(saved.columnInformation || {})
      };
      appState.methodDevelopmentState = saved.methodDevelopmentState ?? null;
      appState.currentDecision = saved.currentDecision ?? null;
      appState.nextRunConditions = saved.nextRunConditions ?? null;
      appState.activeDashboardTab = saved.activeDashboardTab === 'equipment' ? 'equipment' : 'run-review';
      appState.allRunsImportedAtOnce = saved.allRunsImportedAtOnce === true;
    } catch {
      return;
    }
  };

  app.persistUserState = function persistUserState(appState) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        methodSpecifications: appState.methodSpecifications,
        currentRun: appState.currentRun,
        multiFileBatchRunIds: appState.multiFileBatchRunIds,
        runHistory: appState.runHistory,
        columnInformation: appState.columnInformation,
        methodDevelopmentState: appState.methodDevelopmentState,
        currentDecision: appState.currentDecision,
        nextRunConditions: appState.nextRunConditions,
        activeDashboardTab: appState.activeDashboardTab,
        allRunsImportedAtOnce: appState.allRunsImportedAtOnce
      }));
    } catch {
      return false;
    }
    return true;
  };

  app.clearPersistedUserState = function clearPersistedUserState() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      return false;
    }
    return true;
  };
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});