export const EXTERNAL_TABLET_DASHBOARD_URL = 'https://nokia215.github.io/tab_ext/tablet.html';

export function shouldDelegateDashboardToWeb(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return userAgent.includes('Android') && userAgent.includes('Firefox/');
}

export function resolveDashboardUrl(getRuntimeUrl: (path: string) => string) {
  return shouldDelegateDashboardToWeb()
    ? EXTERNAL_TABLET_DASHBOARD_URL
    : getRuntimeUrl('newtab.html');
}
