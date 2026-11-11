import { useRouter } from 'expo-router';
import { useState } from 'react';

import { FormScreen, Segmented } from '@/components/ui';
import { useI18n } from '@/i18n/provider';
import { ContactsPicker } from '@/send/contacts-picker';
import { useDraft, type Recipient } from '@/send/draft';
import { LookupForm } from '@/send/lookup-form';

type Mode = 'phone' | 'account' | 'contacts';

/** Send money to a person: by phone number, account number or from the phone's contacts. */
export default function Transfer() {
  const router = useRouter();
  const { t } = useI18n();
  const { startPayment, generation } = useDraft();
  const [mode, setMode] = useState<Mode>('phone');

  function choose(recipient: Recipient) {
    startPayment(recipient);
    router.push('/send/amount');
  }

  return (
    <FormScreen>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'phone', label: t('send.phone') },
          { value: 'account', label: t('send.account') },
          { value: 'contacts', label: t('send.contacts') },
        ]}
      />
      {/* The key starts each form fresh when switching modes AND after a payment finishes. */}
      {mode === 'contacts' ? <ContactsPicker key={generation} onPick={choose} /> : <LookupForm key={`${mode}-${generation}`} mode={mode} onChoose={choose} />}
    </FormScreen>
  );
}
