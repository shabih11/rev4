import { useSyncExternalStore } from 'react';
import { simulationSnapshot, subscribeSimulation } from './lib/simulationState';
import App from './App';
import { AuthProvider } from './context/AuthProvider';
import { DataProvider } from './context/DataProvider';

export function SessionApp() {
  const simulation = useSyncExternalStore(subscribeSimulation, simulationSnapshot);
  return <DataProvider key={simulation?.id || 'administrator'}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </DataProvider>;
}
