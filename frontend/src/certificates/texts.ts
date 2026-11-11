// The words printed on certificates, in the language OF THE DOCUMENT (which can differ from the app's language: a
// customer may need a Russian letter while using the app in Persian). Sentences are small functions so word order
// and grammar stay natural in each language.

import type { CertificateLang, CertificateType } from './types';

export type DocTexts = {
  bank: string;
  bankKind: string;
  titles: Record<CertificateType, string>;
  ref: string;
  date: string;
  concern: string;
  holder: string;
  accountNo: string;
  currency: string;
  accountType: Record<string, string>;
  status: Record<string, string>;
  opened: string;
  balance: string;
  period: string;
  moneyIn: string;
  moneyOut: string;
  operations: string;
  col: { date: string; description: string; counterparty: string; amount: string; balance: string; month: string; payments: string; account: string; type: string; status: string };
  bankLabel: string;
  bic: string;
  swift: string;
  corr: string;
  inn: string;
  lowest: string;
  average: string;
  truncated: string;
  signatory: string;
  position: string;
  stamp: string;
  stampCenter: string;
  footer: string;
  sentences: Record<CertificateType, (p: Record<string, string>) => string>;
  merchant: string;
  exchange: string;
  bankParty: string;
  demoDeposit: string;
  all: string;
};

const en: DocTexts = {
  bank: 'Banking Demo',
  bankKind: 'Bank',
  titles: {
    account_confirmation: 'Account Certificate',
    balance: 'Balance Certificate',
    statement: 'Official Account Statement',
    bank_details: 'Bank Details Letter',
    income: 'Certificate of Income',
    proof_of_funds: 'Proof of Funds',
    relationship: 'Customer Certificate',
    no_debt: 'Certificate of No Debt',
  },
  ref: 'Reference No.',
  date: 'Date of issue',
  concern: 'To whom it may concern',
  holder: 'Account holder',
  accountNo: 'Account number',
  currency: 'Currency',
  accountType: { checking: 'Checking', savings: 'Savings' },
  status: { active: 'active', frozen: 'frozen', closed: 'closed' },
  opened: 'Opened on',
  balance: 'Balance',
  period: 'Period',
  moneyIn: 'Money received',
  moneyOut: 'Money spent',
  operations: 'Operations',
  col: { date: 'Date', description: 'Description', counterparty: 'Counterparty', amount: 'Amount', balance: 'Balance', month: 'Month', payments: 'Payments', account: 'Account', type: 'Type', status: 'Status' },
  bankLabel: 'Bank',
  bic: 'BIC',
  swift: 'SWIFT',
  corr: 'Correspondent account',
  inn: 'Tax ID (INN)',
  lowest: 'Lowest balance',
  average: 'Average balance',
  truncated: 'Only the most recent operations are shown.',
  signatory: 'Bank Management',
  position: '',
  stamp: 'BANKING DEMO · OFFICIAL DOCUMENT ·',
  stampCenter: 'APPROVED',
  footer: 'This document was issued electronically and is valid with the bank stamp and signature.',
  sentences: {
    account_confirmation: (p) => `Banking Demo confirms that ${p.name} is a customer of the bank and holds ${p.type} account No. ${p.number} in ${p.currency}, opened on ${p.opened}. As of ${p.issued} the account is ${p.status}.`,
    balance: (p) => `Banking Demo confirms that on ${p.issued} the balance of ${p.type} account No. ${p.number} held by ${p.name} is ${p.balance}.`,
    statement: (p) => `Official statement of ${p.type} account No. ${p.number} (${p.currency}) held by ${p.name}, for the period ${p.period}.`,
    bank_details: (p) => `Banking Demo provides the details below for payments to ${p.name}.`,
    income: (p) => `Banking Demo confirms that ${p.name} received ${p.total} in ${p.count} incoming payments to ${p.type} account No. ${p.number} during the period ${p.period}. Transfers between the customer's own accounts and currency exchanges are not counted.`,
    proof_of_funds: (p) => `Banking Demo confirms that ${p.name} holds ${p.type} account No. ${p.number} and that its balance over the last 90 days was as shown below.`,
    relationship: (p) => `Banking Demo confirms that ${p.name} has been a customer of the bank since ${p.since} and currently holds ${p.count} account(s) listed below.`,
    no_debt: (p) => `Banking Demo confirms that, as of ${p.issued}, ${p.name} has no outstanding loans, credits, overdrafts or other debt obligations to the bank (${p.count} account(s) reviewed).`,
  },
  merchant: 'Card payment',
  exchange: 'Currency exchange',
  bankParty: 'Bank',
  demoDeposit: 'Deposit',
  all: 'start',
};

const ru: DocTexts = {
  bank: 'Banking Demo',
  bankKind: 'Банк',
  titles: {
    account_confirmation: 'Справка о наличии счёта',
    balance: 'Справка об остатке на счёте',
    statement: 'Официальная выписка по счёту',
    bank_details: 'Письмо с реквизитами счёта',
    income: 'Справка о поступлениях',
    proof_of_funds: 'Справка о наличии средств',
    relationship: 'Справка о клиенте банка',
    no_debt: 'Справка об отсутствии задолженности',
  },
  ref: 'Исходящий №',
  date: 'Дата выдачи',
  concern: 'По месту требования',
  holder: 'Владелец счёта',
  accountNo: 'Номер счёта',
  currency: 'Валюта',
  accountType: { checking: 'Текущий', savings: 'Накопительный' },
  status: { active: 'активен', frozen: 'заморожен', closed: 'закрыт' },
  opened: 'Дата открытия',
  balance: 'Остаток',
  period: 'Период',
  moneyIn: 'Поступления',
  moneyOut: 'Списания',
  operations: 'Операций',
  col: { date: 'Дата', description: 'Описание', counterparty: 'Контрагент', amount: 'Сумма', balance: 'Остаток', month: 'Месяц', payments: 'Платежей', account: 'Счёт', type: 'Тип', status: 'Статус' },
  bankLabel: 'Банк',
  bic: 'БИК',
  swift: 'SWIFT',
  corr: 'Корреспондентский счёт',
  inn: 'ИНН',
  lowest: 'Минимальный остаток',
  average: 'Средний остаток',
  truncated: 'Показаны только последние операции.',
  signatory: 'Руководство банка',
  position: '',
  stamp: 'BANKING DEMO · ОФИЦИАЛЬНЫЙ ДОКУМЕНТ ·',
  stampCenter: 'ВЫДАНО',
  footer: 'Документ выдан в электронном виде и действителен при наличии печати и подписи банка.',
  sentences: {
    account_confirmation: (p) => `Banking Demo подтверждает, что ${p.name} является клиентом банка и имеет ${p.type} счёт № ${p.number} в валюте ${p.currency}, открытый ${p.opened}. По состоянию на ${p.issued} счёт ${p.status}.`,
    balance: (p) => `Banking Demo подтверждает, что по состоянию на ${p.issued} остаток на ${p.type} счёте № ${p.number}, принадлежащем ${p.name}, составляет ${p.balance}.`,
    statement: (p) => `Официальная выписка по ${p.type} счёту № ${p.number} (${p.currency}), принадлежащему ${p.name}, за период ${p.period}.`,
    bank_details: (p) => `Banking Demo предоставляет приведённые ниже реквизиты для платежей в пользу ${p.name}.`,
    income: (p) => `Banking Demo подтверждает, что ${p.name} за период ${p.period} получил(а) на ${p.type} счёт № ${p.number} ${p.total} (входящих платежей: ${p.count}). Переводы между собственными счетами клиента и обмен валюты не учитываются.`,
    proof_of_funds: (p) => `Banking Demo подтверждает, что ${p.name} имеет ${p.type} счёт № ${p.number}, а остаток на нём за последние 90 дней был таким, как указано ниже.`,
    relationship: (p) => `Banking Demo подтверждает, что ${p.name} является клиентом банка с ${p.since} и в настоящее время имеет счетов: ${p.count} (перечислены ниже).`,
    no_debt: (p) => `Banking Demo подтверждает, что по состоянию на ${p.issued} у ${p.name} нет непогашенных кредитов, овердрафтов и иной задолженности перед банком (проверено счетов: ${p.count}).`,
  },
  merchant: 'Оплата картой',
  exchange: 'Обмен валюты',
  bankParty: 'Банк',
  demoDeposit: 'Пополнение',
  all: 'начала',
};

const fa: DocTexts = {
  bank: 'Banking Demo',
  bankKind: 'بانک',
  titles: {
    account_confirmation: 'گواهی داشتن حساب',
    balance: 'گواهی موجودی حساب',
    statement: 'صورت‌حساب رسمی',
    bank_details: 'نامهٔ مشخصات حساب بانکی',
    income: 'گواهی درآمد (واریزی‌ها)',
    proof_of_funds: 'گواهی توانایی مالی',
    relationship: 'گواهی مشتری بانک',
    no_debt: 'گواهی عدم بدهی',
  },
  ref: 'شمارهٔ ارجاع',
  date: 'تاریخ صدور',
  concern: 'به مرجع ذی‌ربط',
  holder: 'صاحب حساب',
  accountNo: 'شمارهٔ حساب',
  currency: 'ارز',
  accountType: { checking: 'جاری', savings: 'پس‌انداز' },
  status: { active: 'فعال', frozen: 'مسدود', closed: 'بسته' },
  opened: 'تاریخ افتتاح',
  balance: 'موجودی',
  period: 'بازه',
  moneyIn: 'مجموع دریافتی',
  moneyOut: 'مجموع پرداختی',
  operations: 'تعداد تراکنش',
  col: { date: 'تاریخ', description: 'شرح', counterparty: 'طرف حساب', amount: 'مبلغ', balance: 'مانده', month: 'ماه', payments: 'تعداد واریز', account: 'حساب', type: 'نوع', status: 'وضعیت' },
  bankLabel: 'بانک',
  bic: 'کد BIC',
  swift: 'کد SWIFT',
  corr: 'حساب کارگزار',
  inn: 'شناسهٔ مالیاتی (INN)',
  lowest: 'کمترین موجودی',
  average: 'میانگین موجودی',
  truncated: 'فقط آخرین تراکنش‌ها نمایش داده شده است.',
  signatory: 'مدیریت بانک',
  position: '',
  stamp: 'BANKING DEMO · سند رسمی ·',
  stampCenter: 'تأیید شد',
  footer: 'این سند به‌صورت الکترونیکی صادر شده و با مهر و امضای بانک معتبر است.',
  sentences: {
    account_confirmation: (p) => `بانک Banking Demo گواهی می‌کند که ${p.name} مشتری این بانک است و دارای حساب ${p.type} به شمارهٔ ${p.number} به ارز ${p.currency} می‌باشد که در تاریخ ${p.opened} افتتاح شده است. در تاریخ ${p.issued} این حساب ${p.status} است.`,
    balance: (p) => `بانک Banking Demo گواهی می‌کند که در تاریخ ${p.issued} موجودی حساب ${p.type} به شمارهٔ ${p.number} متعلق به ${p.name} برابر ${p.balance} است.`,
    statement: (p) => `صورت‌حساب رسمی حساب ${p.type} به شمارهٔ ${p.number} (${p.currency}) متعلق به ${p.name} برای بازهٔ ${p.period}.`,
    bank_details: (p) => `بانک Banking Demo مشخصات زیر را برای واریز وجه به ${p.name} ارائه می‌کند.`,
    income: (p) => `بانک Banking Demo گواهی می‌کند که ${p.name} در بازهٔ ${p.period} مبلغ ${p.total} را طی ${p.count} واریز به حساب ${p.type} شمارهٔ ${p.number} دریافت کرده است. انتقال بین حساب‌های خود مشتری و تبدیل ارز محاسبه نشده است.`,
    proof_of_funds: (p) => `بانک Banking Demo گواهی می‌کند که ${p.name} دارای حساب ${p.type} به شمارهٔ ${p.number} است و موجودی آن در ۹۰ روز گذشته مطابق جدول زیر بوده است.`,
    relationship: (p) => `بانک Banking Demo گواهی می‌کند که ${p.name} از تاریخ ${p.since} مشتری این بانک است و در حال حاضر دارای ${p.count} حساب است که در زیر آمده است.`,
    no_debt: (p) => `بانک Banking Demo گواهی می‌کند که در تاریخ ${p.issued}، ${p.name} هیچ وام، اعتبار، اضافه‌برداشت یا تعهد بدهی معوقی نزد بانک ندارد (${p.count} حساب بررسی شد).`,
  },
  merchant: 'خرید با کارت',
  exchange: 'تبدیل ارز',
  bankParty: 'بانک',
  demoDeposit: 'واریز',
  all: 'ابتدا',
};

export const DOC_TEXTS: Record<CertificateLang, DocTexts> = { en, ru, fa };
