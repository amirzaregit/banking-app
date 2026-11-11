// The newsletter: short, practical articles in three languages. Plain data, so it is easy to test and to replace
// later with articles fetched from a server.

import type { Lang } from '@/i18n';

export type NewsCategory = 'security' | 'banking' | 'money' | 'bank';
export type Article = {
  id: string;
  category: NewsCategory;
  icon: string; // an Ionicons name
  minutes: number;
  title: Record<Lang, string>;
  summary: Record<Lang, string>;
  body: Record<Lang, string[]>;
};

export const CATEGORIES: NewsCategory[] = ['security', 'banking', 'money', 'bank'];

export const ARTICLES: Article[] = [
  {
    id: 'fake-sms',
    category: 'security',
    icon: 'warning-outline',
    minutes: 3,
    title: { en: 'How to spot a fake bank message', ru: 'Как распознать поддельное сообщение «от банка»', fa: 'چگونه پیام جعلی بانک را تشخیص دهیم' },
    summary: { en: 'Scam texts copy the look of real ones. Five signs give them away.', ru: 'Мошеннические SMS копируют настоящие. Пять признаков выдают подделку.', fa: 'پیامک‌های کلاهبرداری شبیه پیام‌های واقعی‌اند. پنج نشانه آن‌ها را لو می‌دهد.' },
    body: {
      en: [
        'A fake message usually creates panic: “your card is blocked”, “a payment is being made, cancel now”. Real banks do not rush you. Stop and breathe before you tap anything.',
        'Look at the link. A real bank link ends with the bank’s own domain. Slightly different spelling, extra words or a shortened link are red flags. When in doubt, never open the link: open the app yourself.',
        'A bank will never ask for your PIN, your full card number, your password or the one-time code from an SMS. If a message or a caller asks for any of these, it is a scam, even if they know your name.',
        'If you already tapped or typed something, call the bank at once using the number inside the app (Support), and freeze your card from the account screen.',
      ],
      ru: [
        'Поддельное сообщение обычно пугает: «карта заблокирована», «идёт платёж, отмените срочно». Настоящий банк не торопит. Остановитесь и выдохните, прежде чем нажимать.',
        'Посмотрите на ссылку. Настоящая ссылка банка заканчивается его официальным доменом. Чуть изменённое написание, лишние слова или сокращённая ссылка — тревожные признаки. Сомневаетесь — не открывайте ссылку, зайдите в приложение сами.',
        'Банк никогда не спросит ваш ПИН-код, полный номер карты, пароль или одноразовый код из SMS. Если об этом просит сообщение или звонящий — это мошенники, даже если они знают ваше имя.',
        'Если вы уже что-то нажали или ввели, сразу позвоните в банк по номеру из приложения (Поддержка) и заморозьте карту на экране счёта.',
      ],
      fa: [
        'پیام جعلی معمولاً ترس ایجاد می‌کند: «کارت شما مسدود شد»، «پرداختی در حال انجام است، همین حالا لغو کنید». بانک واقعی شما را عجله نمی‌دهد. پیش از زدن هر چیزی مکث کنید.',
        'به لینک نگاه کنید. لینک واقعی بانک به دامنهٔ رسمی خود بانک ختم می‌شود. املای کمی متفاوت، کلمات اضافه یا لینک کوتاه‌شده نشانهٔ خطر است. اگر شک دارید لینک را باز نکنید و خودتان برنامه را باز کنید.',
        'بانک هرگز رمز، شمارهٔ کامل کارت، گذرواژه یا کد یک‌بارمصرف پیامک را نمی‌پرسد. اگر پیام یا تماس‌گیرنده‌ای این‌ها را خواست، کلاهبردار است، حتی اگر نام شما را بداند.',
        'اگر پیش‌تر چیزی را زده یا وارد کرده‌اید، فوراً با شمارهٔ داخل برنامه (پشتیبانی) با بانک تماس بگیرید و کارت را از صفحهٔ حساب مسدود کنید.',
      ],
    },
  },
  {
    id: 'never-share-codes',
    category: 'security',
    icon: 'key-outline',
    minutes: 2,
    title: { en: 'Never share your PIN or one-time code', ru: 'Никому не сообщайте ПИН-код и одноразовые коды', fa: 'رمز و کد یک‌بارمصرف را به کسی ندهید' },
    summary: { en: 'The code in an SMS is the key to one payment. Keep it to yourself.', ru: 'Код из SMS — ключ к одному платежу. Храните его в тайне.', fa: 'کد پیامک کلید یک پرداخت است. آن را پیش خودتان نگه دارید.' },
    body: {
      en: [
        'Your PIN proves it is you. The one-time code proves it is you for one specific payment. Anyone who has them can move your money, so they are never for sharing, not with a friend, a “bank employee” or the police.',
        'In this app a code is tied to the exact payment it was sent for. If someone asks you to read out a code, the payment they are making is the one you would be approving.',
        'Choose a PIN that is not your birthday or 123456. The app refuses weak PINs and locks after five wrong tries to protect you.',
      ],
      ru: [
        'ПИН-код подтверждает, что это вы. Одноразовый код подтверждает, что это вы, для одного конкретного платежа. Тот, у кого они есть, может перевести ваши деньги, поэтому их нельзя называть никому: ни другу, ни «сотруднику банка», ни полиции.',
        'В этом приложении код привязан к тому платежу, для которого он отправлен. Если вас просят продиктовать код, вы подтвердите именно тот платёж, который делает собеседник.',
        'Выбирайте ПИН-код, который не равен дате рождения или 123456. Приложение не принимает слабые ПИН-коды и блокирует ввод после пяти ошибок.',
      ],
      fa: [
        'رمز شما ثابت می‌کند که خودتان هستید. کد یک‌بارمصرف ثابت می‌کند که برای همان یک پرداخت خودتان هستید. هر کس این‌ها را داشته باشد می‌تواند پول شما را جابه‌جا کند؛ پس آن‌ها را به هیچ‌کس نگویید، نه دوست، نه «کارمند بانک»، نه پلیس.',
        'در این برنامه هر کد به همان پرداختی گره خورده که برایش فرستاده شده است. اگر کسی از شما خواست کد را بخوانید، شما همان پرداختی را تأیید می‌کنید که او انجام می‌دهد.',
        'رمزی انتخاب کنید که تاریخ تولد یا 123456 نباشد. برنامه رمزهای ضعیف را نمی‌پذیرد و بعد از پنج اشتباه آن را قفل می‌کند.',
      ],
    },
  },
  {
    id: 'spam-calls',
    category: 'security',
    icon: 'call-outline',
    minutes: 3,
    title: { en: 'Spam calls and the “safe account” trick', ru: 'Спам-звонки и уловка с «безопасным счётом»', fa: 'تماس‌های مزاحم و ترفند «حساب امن»' },
    summary: { en: 'Callers who say your money is in danger are the danger.', ru: 'Звонящие, которые говорят, что ваши деньги в опасности, и есть опасность.', fa: 'کسانی که می‌گویند پولتان در خطر است، خودشان خطرند.' },
    body: {
      en: [
        'A common scam: a caller says they are from the bank or the police and that your money is under attack, so you must move it to a “safe account” right now. There is no such thing. The safe place for your money is your own account.',
        'They use pressure, a serious voice and sometimes your real name or last four card digits. None of that proves who they are, because that information leaks from shops and old databases.',
        'Hang up. Do not call back on a number they give you. Open the app and use Support, or visit a branch. Report the number so others are protected.',
      ],
      ru: [
        'Частая схема: звонящий представляется сотрудником банка или полиции и говорит, что на ваши деньги напали, поэтому их срочно нужно перевести на «безопасный счёт». Такого счёта не существует. Безопасное место для денег — ваш собственный счёт.',
        'Они давят, говорят серьёзным тоном и иногда знают ваше настоящее имя или последние четыре цифры карты. Это ничего не доказывает: такие данные утекают из магазинов и старых баз.',
        'Положите трубку. Не перезванивайте на номер, который вам продиктовали. Откройте приложение и обратитесь в «Поддержку» или зайдите в отделение. Сообщите о номере, чтобы защитить других.',
      ],
      fa: [
        'یک کلاهبرداری رایج: تماس‌گیرنده می‌گوید از بانک یا پلیس است و پولتان در خطر است، پس باید فوراً آن را به «حساب امن» منتقل کنید. چنین چیزی وجود ندارد. جای امن پول شما حساب خودتان است.',
        'آن‌ها فشار می‌آورند، با لحن جدی حرف می‌زنند و گاهی نام واقعی یا چهار رقم آخر کارتتان را می‌دانند. این‌ها چیزی را ثابت نمی‌کند؛ چنین اطلاعاتی از فروشگاه‌ها و پایگاه‌های قدیمی لو می‌رود.',
        'قطع کنید. با شماره‌ای که به شما می‌دهند تماس نگیرید. برنامه را باز کنید و از «پشتیبانی» استفاده کنید یا به شعبه بروید. شماره را گزارش کنید تا دیگران محافظت شوند.',
      ],
    },
  },
  {
    id: 'safe-online-shopping',
    category: 'security',
    icon: 'card-outline',
    minutes: 2,
    title: { en: 'Shop online safely with a virtual card', ru: 'Безопасные покупки онлайн с виртуальной картой', fa: 'خرید امن اینترنتی با کارت مجازی' },
    summary: { en: 'A virtual card you can freeze in one tap limits the damage of a leak.', ru: 'Виртуальную карту можно заморозить одним касанием, и утечка не страшна.', fa: 'کارت مجازی که با یک لمس مسدود می‌شود، خسارت نشت اطلاعات را محدود می‌کند.' },
    body: {
      en: [
        'Use a virtual card for online shops you do not know well. Keep only the money you plan to spend on its account, and you cannot lose more than that.',
        'Freeze the card from the account screen when you are not using it. A frozen card declines every purchase, and you can unfreeze it whenever you need it.',
        'Check your History after shopping. Spot a payment you do not recognise? Freeze the card and contact Support right away.',
      ],
      ru: [
        'Используйте виртуальную карту для малознакомых интернет-магазинов. Держите на её счёте только ту сумму, которую собираетесь потратить, и потерять больше вы не сможете.',
        'Замораживайте карту на экране счёта, когда не пользуетесь ею. Замороженная карта отклоняет все покупки, а разморозить её можно в любой момент.',
        'После покупок проверяйте «Историю». Нашли незнакомый платёж? Заморозьте карту и сразу обратитесь в «Поддержку».',
      ],
      fa: [
        'برای فروشگاه‌های اینترنتی ناآشنا از کارت مجازی استفاده کنید. فقط مبلغی را که قصد خرج کردنش را دارید در حساب آن نگه دارید تا بیشتر از آن از دست نرود.',
        'وقتی از کارت استفاده نمی‌کنید، آن را از صفحهٔ حساب مسدود کنید. کارت مسدود همهٔ خریدها را رد می‌کند و هر زمان بخواهید می‌توانید آن را فعال کنید.',
        'بعد از خرید «تاریخچه» را ببینید. پرداخت ناآشنایی دیدید؟ کارت را مسدود کنید و فوراً با «پشتیبانی» تماس بگیرید.',
      ],
    },
  },
  {
    id: 'how-balance-works',
    category: 'banking',
    icon: 'book-outline',
    minutes: 3,
    title: { en: 'How your balance really works', ru: 'Как на самом деле устроен ваш баланс', fa: 'موجودی حساب واقعاً چگونه کار می‌کند' },
    summary: { en: 'Banks do not edit a number. They add lines to a book that is never erased.', ru: 'Банк не правит число. Он добавляет строки в книгу, которую нельзя стирать.', fa: 'بانک عددی را ویرایش نمی‌کند؛ خط‌هایی به دفتری اضافه می‌کند که هرگز پاک نمی‌شود.' },
    body: {
      en: [
        'Your balance is not a number someone types in. It is the total of every line in a ledger: +100 for a deposit, −20 for a payment. Add them up and you have the balance at any moment.',
        'Every payment is written twice: money leaves one account and arrives in another, and the two lines cancel out. That is called double-entry bookkeeping, and it means money is never created or lost by accident.',
        'Lines are never edited or deleted. A mistake is fixed by adding a new line that reverses it. That is why your statement is a trustworthy record, and why you can ask the bank for an official one in Documents.',
      ],
      ru: [
        'Баланс — это не число, которое кто-то вписывает. Это сумма всех строк в журнале: +100 за пополнение, −20 за платёж. Сложите их — и получите баланс на любой момент.',
        'Каждый платёж записывается дважды: деньги уходят с одного счёта и приходят на другой, и две строки взаимно гасятся. Это двойная запись, и благодаря ей деньги не возникают и не исчезают случайно.',
        'Строки никогда не правят и не удаляют. Ошибку исправляют новой строкой, которая её отменяет. Поэтому выписка — надёжный документ, и именно поэтому в «Справках» можно заказать официальную.',
      ],
      fa: [
        'موجودی عددی نیست که کسی تایپ کند؛ مجموع همهٔ خط‌های یک دفتر است: +100 برای واریز، −20 برای پرداخت. آن‌ها را جمع کنید تا موجودی در هر لحظه به دست آید.',
        'هر پرداخت دو بار ثبت می‌شود: پول از یک حساب خارج و به حساب دیگر وارد می‌شود و دو خط همدیگر را خنثی می‌کنند. این «حسابداری دوطرفه» است و باعث می‌شود پول اشتباهاً ساخته یا گم نشود.',
        'خط‌ها هرگز ویرایش یا حذف نمی‌شوند. اشتباه با افزودن خط جدیدی که آن را برمی‌گرداند اصلاح می‌شود. برای همین صورت‌حساب مدرکی قابل اعتماد است و می‌توانید نسخهٔ رسمی آن را از «گواهی‌ها» بگیرید.',
      ],
    },
  },
  {
    id: 'how-exchange-works',
    category: 'banking',
    icon: 'swap-horizontal-outline',
    minutes: 3,
    title: { en: 'How currency exchange works', ru: 'Как работает обмен валюты', fa: 'تبدیل ارز چگونه کار می‌کند' },
    summary: { en: 'One rate, two ledgers, and why the amount is rounded down.', ru: 'Один курс, две книги и почему сумма округляется вниз.', fa: 'یک نرخ، دو دفتر، و دلیل گرد شدن مبلغ به پایین.' },
    body: {
      en: [
        'An exchange rate says how many units of one currency one unit of another buys. 1 USD = 80 RUB means $10 becomes ₽800. Rates move all day, so always check the amount you will get before you confirm.',
        'Behind the scenes the bank’s own pool takes your dollars and pays you rubles. Each currency has its own books that balance on their own, so the exchange is two linked entries, one in each currency.',
        'Amounts are rounded down to the smallest unit, so you never get a fraction more than the rate says. The Rates calculator in the app is for planning; the Exchange screen is for the real thing between your own accounts.',
      ],
      ru: [
        'Курс показывает, сколько единиц одной валюты покупает единица другой. 1 USD = 80 RUB означает, что $10 превращаются в ₽800. Курсы меняются в течение дня, поэтому всегда проверяйте сумму перед подтверждением.',
        'За кулисами собственный пул банка забирает ваши доллары и выплачивает рубли. У каждой валюты своя книга, которая сходится сама по себе, поэтому обмен — это две связанные записи, по одной в каждой валюте.',
        'Суммы округляются вниз до минимальной единицы, поэтому вы никогда не получите больше, чем даёт курс. Калькулятор курсов — для планирования, а экран «Обмен» — для настоящих операций между вашими счетами.',
      ],
      fa: [
        'نرخ ارز نشان می‌دهد یک واحد از یک ارز چند واحد از ارز دیگر می‌خرد. 1 دلار = 80 روبل یعنی ۱۰ دلار می‌شود ۸۰۰ روبل. نرخ‌ها در طول روز تغییر می‌کنند؛ پس پیش از تأیید مبلغ دریافتی را ببینید.',
        'در پشت صحنه، ذخیرهٔ خود بانک دلارهای شما را می‌گیرد و روبل می‌دهد. هر ارز دفتر جداگانهٔ خودش را دارد که به‌تنهایی تراز می‌شود؛ پس تبدیل دو ثبت پیوسته است، یکی در هر ارز.',
        'مبلغ‌ها به کوچک‌ترین واحد گرد به پایین می‌شوند تا هرگز بیشتر از نرخ نگیرید. ماشین‌حساب نرخ برای برنامه‌ریزی است و صفحهٔ «تبدیل ارز» برای انجام واقعی بین حساب‌های خودتان.',
      ],
    },
  },
  {
    id: 'rule-50-30-20',
    category: 'money',
    icon: 'pie-chart-outline',
    minutes: 2,
    title: { en: 'The 50/30/20 rule for your budget', ru: 'Правило 50/30/20 для бюджета', fa: 'قاعدهٔ ۵۰/۳۰/۲۰ برای بودجه' },
    summary: { en: 'A simple split of your income: needs, wants and savings.', ru: 'Простое деление дохода: нужное, желаемое и накопления.', fa: 'تقسیم ساده درآمد: نیازها، خواسته‌ها و پس‌انداز.' },
    body: {
      en: [
        'Spend about 50% of what you earn on needs (rent, food, bills, transport), up to 30% on wants (fun, eating out, hobbies) and put at least 20% into savings or paying off debt.',
        'It is a starting point, not a law. If rent takes 60%, trim wants first and keep the savings part, even if it is only 5%.',
        'Make it automatic: open a savings account and move money there on payday, before you can spend it. Check History each month to see where the rest went.',
      ],
      ru: [
        'Около 50% дохода тратьте на нужное (жильё, еда, счета, транспорт), до 30% — на желаемое (развлечения, кафе, хобби), а не менее 20% откладывайте или направляйте на погашение долгов.',
        'Это ориентир, а не закон. Если аренда съедает 60%, сначала сократите «желаемое», но оставьте часть на накопления, пусть даже 5%.',
        'Сделайте это автоматическим: откройте накопительный счёт и переводите туда деньги в день зарплаты, пока их не потратили. Раз в месяц смотрите «Историю», чтобы понять, куда ушло остальное.',
      ],
      fa: [
        'حدود ۵۰٪ درآمد را برای نیازها (اجاره، غذا، قبوض، رفت‌وآمد)، تا ۳۰٪ را برای خواسته‌ها (تفریح، رستوران، سرگرمی) و دست‌کم ۲۰٪ را برای پس‌انداز یا پرداخت بدهی کنار بگذارید.',
        'این یک نقطهٔ شروع است، نه قانون. اگر اجاره ۶۰٪ را می‌برد، اول از خواسته‌ها کم کنید و بخش پس‌انداز را حفظ کنید، حتی اگر فقط ۵٪ باشد.',
        'آن را خودکار کنید: یک حساب پس‌انداز باز کنید و روز حقوق، پیش از آنکه خرجش کنید، پول را به آنجا ببرید. هر ماه «تاریخچه» را ببینید تا بدانید بقیه کجا رفته است.',
      ],
    },
  },
  {
    id: 'emergency-fund',
    category: 'money',
    icon: 'umbrella-outline',
    minutes: 2,
    title: { en: 'Build an emergency fund', ru: 'Создайте финансовую подушку', fa: 'صندوق اضطراری بسازید' },
    summary: { en: 'Three months of basic costs turn a crisis into an inconvenience.', ru: 'Расходы за три месяца превращают кризис в неудобство.', fa: 'هزینهٔ سه ماه زندگی بحران را به یک ناراحتی کوچک تبدیل می‌کند.' },
    body: {
      en: [
        'An emergency fund is money you keep only for surprises: a broken phone, a medical bill, a lost job. The usual goal is three to six months of basic costs.',
        'Start small. Even one week of costs helps. Open a separate savings account so the money is out of sight, and add a fixed amount every month.',
        'If you hold more than one currency, keep part of the fund in the currency of your biggest costs, so a sudden change in rates hurts less.',
      ],
      ru: [
        'Финансовая подушка — это деньги, которые вы держите только на непредвиденные случаи: сломанный телефон, лечение, потеря работы. Обычная цель — расходы за три–шесть месяцев.',
        'Начните с малого. Хватит и недели расходов. Откройте отдельный накопительный счёт, чтобы деньги были «с глаз долой», и каждый месяц добавляйте фиксированную сумму.',
        'Если у вас несколько валют, держите часть подушки в валюте основных расходов, чтобы резкая смена курса ударила слабее.',
      ],
      fa: [
        'صندوق اضطراری پولی است که فقط برای اتفاق‌های غیرمنتظره نگه می‌دارید: گوشی خراب، هزینهٔ درمان، از دست دادن شغل. هدف معمول هزینهٔ سه تا شش ماه است.',
        'کوچک شروع کنید. حتی هزینهٔ یک هفته هم کمک می‌کند. یک حساب پس‌انداز جدا باز کنید تا پول از جلوی چشم دور باشد و هر ماه مبلغ ثابتی اضافه کنید.',
        'اگر بیش از یک ارز دارید، بخشی از صندوق را به ارز هزینه‌های اصلی‌تان نگه دارید تا تغییر ناگهانی نرخ کمتر آسیب بزند.',
      ],
    },
  },
  {
    id: 'whats-new',
    category: 'bank',
    icon: 'sparkles-outline',
    minutes: 2,
    title: { en: 'What is new in Banking Demo', ru: 'Что нового в Banking Demo', fa: 'تازه‌های Banking Demo' },
    summary: { en: 'Accounts in rubles, rials and dollars, exchange, documents, payment requests and gifts.', ru: 'Счета в рублях, риалах и долларах, обмен, справки, запросы платежей и подарки.', fa: 'حساب‌ها به روبل، ریال و دلار، تبدیل ارز، گواهی‌ها، درخواست پرداخت و هدیه.' },
    body: {
      en: [
        'You can now open accounts in rubles, rials or dollars and move money between them with Exchange. Your balance on the Home screen shows each currency separately.',
        'Documents creates official PDF certificates (balance, statement, bank details, proof of income and more) in English, Russian or Persian. Need a paper copy? A branch can print one with a stamp.',
        'In Payments you can request money with a link or QR code, pay bills and mobile top-ups, top up an account, and send a gift with a greeting card.',
      ],
      ru: [
        'Теперь можно открывать счета в рублях, риалах или долларах и переводить деньги между ними через «Обмен». Баланс на главном экране показывается отдельно по каждой валюте.',
        'В «Справках» создаются официальные PDF-справки (остаток, выписка, реквизиты, подтверждение доходов и другие) на английском, русском или персидском. Нужна бумажная копия? Её с печатью оформят в отделении.',
        'В «Платежах» можно запросить деньги по ссылке или QR-коду, оплатить услуги и мобильную связь, пополнить счёт и отправить подарок с открыткой.',
      ],
      fa: [
        'اکنون می‌توانید حساب به روبل، ریال یا دلار باز کنید و با «تبدیل ارز» بین آن‌ها پول جابه‌جا کنید. موجودی صفحهٔ خانه هر ارز را جداگانه نشان می‌دهد.',
        'بخش «گواهی‌ها» گواهی‌های رسمی PDF (موجودی، صورت‌حساب، مشخصات حساب، گواهی درآمد و غیره) را به انگلیسی، روسی یا فارسی می‌سازد. نسخهٔ کاغذی می‌خواهید؟ شعبه آن را با مهر چاپ می‌کند.',
        'در «پرداخت‌ها» می‌توانید با لینک یا کد QR پول درخواست کنید، قبض و شارژ موبایل بپردازید، موجودی حساب را افزایش دهید و هدیه‌ای همراه با کارت تبریک بفرستید.',
      ],
    },
  },
];

export const articleById = (id: string): Article | undefined => ARTICLES.find((a) => a.id === id);
