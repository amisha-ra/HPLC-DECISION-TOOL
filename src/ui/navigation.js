(function (app) {
app.initializeNavigation = function initializeNavigation(appState) {
  const dashboardTabs = [...document.querySelectorAll('[data-dashboard-tab]')];
  const dashboardPanels = [...document.querySelectorAll('[data-dashboard-panel]')];

  function showDashboardTab(tabName, persist = false) {
    for (const button of dashboardTabs) {
      const isActive = button.dataset.dashboardTab === tabName;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    }

    for (const panel of dashboardPanels) {
      const isVisible = panel.dataset.dashboardPanel === tabName;
      panel.hidden = !isVisible;
      panel.classList.toggle('is-visible', isVisible);
    }
    appState.activeDashboardTab = tabName;
    if (persist) app.persistUserState(appState);
  }

  for (const button of dashboardTabs) {
    button.addEventListener('click', () => showDashboardTab(button.dataset.dashboardTab, true));
  }
  const savedTab = dashboardTabs.some((button) => button.dataset.dashboardTab === appState.activeDashboardTab)
    ? appState.activeDashboardTab
    : 'run-review';
  showDashboardTab(savedTab);
};
})(window.HPLCDecisionTool = window.HPLCDecisionTool || {});