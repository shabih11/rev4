import { useId, useLayoutEffect } from 'react';
import { useData } from '../context/DataContext';
import type { RecordDemand } from '../lib/cloudReadPlan';

// Detail screens own their queries; closing one leaves the shared summaries intact.
export function useRecordScope(demand: RecordDemand) {
  const { requestRecords } = useData();
  const id = useId();
  const key = JSON.stringify(demand);
  useLayoutEffect(() => {
    requestRecords(id, JSON.parse(key));
    return () => requestRecords(id, null);
  }, [requestRecords, id, key]);
}
