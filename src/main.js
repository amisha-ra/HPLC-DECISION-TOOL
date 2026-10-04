(function (app) {
	const appState = app.createAppState();
	app.restoreUserState(appState);
	appState.equipmentInformation = app.createEquipmentReference();

	app.initializeNavigation(appState);
	app.initializeDecisionView(appState);
	app.clearChromatogram?.();
	app.initializeDashboard(appState);
	app.initializeEquipmentTab(appState.equipmentInformation);
})(window.HPLCDecisionTool);