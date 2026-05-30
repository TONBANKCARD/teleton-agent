import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shell } from '../Shell';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { SetupProvider } from './SetupContext';
import { SetupNav } from './SetupNav';

const DASHBOARD_LINKS = [
  { labelKey: 'nav.dashboard', path: '/' },
  { labelKey: 'nav.tools', path: '/tools' },
  { labelKey: 'nav.plugins', path: '/plugins' },
  { labelKey: 'nav.soul', path: '/soul' },
  { labelKey: 'nav.memory', path: '/memory' },
  { labelKey: 'nav.logs', path: '/logs' },
  { labelKey: 'nav.workspace', path: '/workspace' },
  { labelKey: 'nav.tasks', path: '/tasks' },
  { labelKey: 'nav.mcp', path: '/mcp' },
  { labelKey: 'nav.config', path: '/config' },
];

function DisabledNav() {
  const { t } = useTranslation();
  return (
    <nav aria-hidden="true">
      {DASHBOARD_LINKS.map((link) => (
        <span key={link.path} className="sidebar-link-disabled">
          {t(link.labelKey)}
        </span>
      ))}
    </nav>
  );
}

function SetupMain() {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <LanguageSwitcher variant="compact" />
      </div>
      <SetupNav />
      <Outlet />
    </>
  );
}

export function SetupLayout() {
  return (
    <SetupProvider>
      <Shell sidebar={<DisabledNav />}>
        <SetupMain />
      </Shell>
    </SetupProvider>
  );
}
