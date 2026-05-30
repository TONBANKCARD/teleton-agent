import { WelcomeStep } from '../components/setup/WelcomeStep';
import { ProviderStep } from '../components/setup/ProviderStep';
import { TelegramStep } from '../components/setup/TelegramStep';
import { ConfigStep } from '../components/setup/ConfigStep';
import { WalletStep } from '../components/setup/WalletStep';
import { ConnectStep } from '../components/setup/ConnectStep';
import { SetupComplete } from '../components/setup/SetupComplete';
import { STEPS, useSetup } from '../components/setup/SetupContext';
import { useTranslation } from 'react-i18next';

// Re-export types for step components that import from here
export type { WizardData, StepProps } from '../components/setup/SetupContext';

const STEP_COMPONENTS = [
  WelcomeStep,
  ProviderStep,
  ConfigStep,
  WalletStep,
  TelegramStep,
  ConnectStep,
];

export function Setup() {
  const { step, data, loading, error, saved, canAdvance, setData, next, prev } =
    useSetup();
  const { t } = useTranslation();

  if (saved) {
    return <SetupComplete />;
  }

  const StepComponent = STEP_COMPONENTS[step];
  const nextStepLabel =
    step < STEPS.length - 1 ? t(`setup.steps.${STEPS[step + 1].id}`) : '';

  return (
    <>
      <StepComponent data={data} onChange={setData} />

      {error && <div className="alert error">{error}</div>}

      <div className="setup-nav">
        {step > 0 && (
          <button className="btn-ghost" onClick={prev} type="button">
            {t('setup.back')}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {step < STEPS.length - 1 && (
          <button onClick={next} disabled={!canAdvance || loading} type="button">
            {loading ? (
              <>
                <span className="spinner sm" /> {t('setup.next')}
              </>
            ) : (
              t('setup.nextStep', { step: nextStepLabel })
            )}
          </button>
        )}
        {/* Last step (Connect): config auto-saves when Telegram auth succeeds */}
      </div>
    </>
  );
}
