import { useLocalSearchParams } from 'expo-router';

import { HistoryView } from '@/history/history-view';

/** One account's own statement (opened from the account page). */
export default function AccountHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HistoryView accountId={id} />;
}
