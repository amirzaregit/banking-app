// The insurance policy certificate: HTML for an A4 page that expo-print turns into a PDF, in the language the customer is
// using. Same page, band, stamp and signature as the bank's other certificates. Pure (no React, no network), so it is
// unit tested. Every value that comes from data is HTML-escaped.

import { escapeHtml, helpers, renderPage } from '@/certificates/document';
import { DOC_TEXTS } from '@/certificates/texts';
import type { InsurancePolicy } from '@/api/types';
import { translate, type Lang } from '@/i18n';

const row = (label: string, value: string) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;

export const policyFileName = (policy: InsurancePolicy): string => `insurance-${policy.policy_number}.pdf`;

/** The complete certificate for one policy, written in `lang` (right-to-left and Persian digits and dates for Persian). */
export function buildPolicyHtml(policy: InsurancePolicy, lang: Lang): string {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const h = helpers(lang, DOC_TEXTS[lang]);
  const d = policy.details;
  const productName = t(`insurance.products.${policy.product}.name`);
  const planName = t(`insurance.plans.${policy.plan}`);

  const rows = [
    row(t('insurance.policy.holder'), `<b>${escapeHtml(policy.holder_name)}</b>`),
    row(t('insurance.policy.number'), h.ltr(policy.policy_number)),
    row(t('insurance.policy.product'), escapeHtml(productName)),
    row(t('insurance.policy.plan'), escapeHtml(planName)),
    row(t('insurance.policy.period'), `${h.day(policy.start_date)} – ${h.day(policy.end_date)}`),
    row(t('insurance.policy.coverage'), h.money(policy.coverage, policy.currency)),
    row(t('insurance.policy.premium'), h.money(policy.premium, policy.currency)),
  ];
  if (d.region) rows.push(row(t('insurance.policy.region'), escapeHtml(t(`insurance.regions.${d.region}`))));
  if (d.travelers) rows.push(row(t('insurance.policy.travelers'), h.ltr(String(d.travelers))));
  if (d.plate) rows.push(row(t('insurance.policy.plate'), h.ltr(d.plate)));
  if (d.address) rows.push(row(t('insurance.policy.address'), escapeHtml(d.address)));
  rows.push(row(t('insurance.policy.account'), h.ltr(`••${policy.account_number.slice(-4)}`)));

  // The lead sentence is a template: escape each value first, then fill them in.
  const lead = t('insurance.doc.lead', {
    name: `<b>${escapeHtml(policy.holder_name)}</b>`,
    product: escapeHtml(productName),
    plan: escapeHtml(planName),
    from: h.day(policy.start_date),
    to: h.day(policy.end_date),
  });
  const bodyHtml = `<p class="lead">${lead}</p><table class="facts">${rows.join('')}</table><p class="note">${escapeHtml(t('insurance.doc.demoNote'))}</p>`;

  return renderPage({
    lang,
    title: t('insurance.doc.title'),
    ref: policy.policy_number,
    issuedOn: policy.created_at.slice(0, 10),
    bodyHtml,
    concern: t('insurance.doc.concern'),
  });
}
