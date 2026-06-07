import { KioskProvider } from '@/core/kiosk';
import { GuidanceProvider } from '@/features/guiding';
import { ServiceProvider } from '@/services';
import { KioskApp } from './KioskApp';

/**
 * Composition root. Provider order matters:
 *   ServiceProvider (DI) → KioskProvider (state machine) → GuidanceProvider
 *   (escort orchestration, needs both) → KioskApp (shell).
 *
 * To go live, pass real implementations: <ServiceProvider services={realServices}>.
 */
export function App() {
  return (
    <ServiceProvider>
      <KioskProvider>
        <GuidanceProvider>
          <KioskApp />
        </GuidanceProvider>
      </KioskProvider>
    </ServiceProvider>
  );
}
