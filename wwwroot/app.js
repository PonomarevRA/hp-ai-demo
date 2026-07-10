const { createElement: h, useMemo, useState } = React;

const rub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const ADVANCED_CATEGORIES = [
  {
    id: "performance",
    title: "Доходность",
    text: "TWR, ROI, MWR, PnL по цепочке отчетов",
    metrics: ["twr", "roi", "mwr", "pnl"],
  },
  {
    id: "risk",
    title: "Риск",
    text: "Max drawdown, volatility, Sharpe, Sortino",
    metrics: ["maxDrawdown", "volatility", "sharpe", "sortino"],
  },
  {
    id: "costs",
    title: "Комиссии",
    text: "fee drag, комиссии к PnL и портфелю",
    metrics: ["feeToPnl", "feeToPortfolio", "turnover"],
  },
  {
    id: "income",
    title: "Доход",
    text: "купоны, дивиденды и вклад дохода",
    metrics: ["incomeYield", "incomeShareOfReturn"],
  },
  {
    id: "concentration",
    title: "Концентрация",
    text: "доля top-1, top-3, top-5 позиций",
    metrics: ["top1Concentration", "top3Concentration", "top5Concentration"],
  },
  {
    id: "currency",
    title: "Валюта",
    text: "валютная экспозиция и FX impact",
    metrics: ["rubExposure", "usdExposure", "otherCurrencyExposure", "fxImpact"],
  },
  {
    id: "pnl",
    title: "PnL split",
    text: "realized / unrealized approximation",
    metrics: ["realizedPnl", "unrealizedPnl"],
  },
];

const ADVANCED_LABELS = {
  twr: "TWR",
  roi: "ROI",
  mwr: "MWR",
  pnl: "PnL",
  maxDrawdown: "Max drawdown",
  volatility: "Volatility",
  sharpe: "Sharpe",
  sortino: "Sortino",
  feeToPnl: "Комиссии / PnL",
  feeToPortfolio: "Комиссии / портфель",
  turnover: "Turnover",
  incomeYield: "Income yield",
  incomeShareOfReturn: "Доля дохода",
  top1Concentration: "Top-1",
  top3Concentration: "Top-3",
  top5Concentration: "Top-5",
  rubExposure: "RUB exposure",
  usdExposure: "USD exposure",
  otherCurrencyExposure: "Other exposure",
  fxImpact: "FX impact",
  realizedPnl: "Realized PnL",
  unrealizedPnl: "Unrealized PnL",
};

const MONEY_METRICS = new Set(["pnl", "fxImpact", "realizedPnl", "unrealizedPnl"]);
const RATIO_METRICS = new Set(["sharpe", "sortino"]);

const AI_SCREEN_GUIDES = {
  home: "Главная страница. Если данных нет, сначала загрузите Excel через input[data-ai-file-input='portfolio-excel']. Если данные есть, используйте summary в JSON ниже и переходите в V1/V2/V3.",
  v1: "V1 показывает базовую аналитику: PnL, ROI, MWR, стоимость портфеля, состав результата и таблицы активов/операций.",
  v2: "V2 показывает investor cockpit: PnL, ROI, MWR, net flow, дополнительные индикаторы и готовый prompt для ИИ-агента.",
  v3: "V3 показывает расширенную аналитику: TWR, drawdown, volatility, Sharpe, Sortino, концентрацию, валютную экспозицию, realized/unrealized PnL.",
  scale: "Информационная страница о масштабировании сервиса. Чисел портфеля здесь нет; используйте summary JSON, если отчеты уже загружены.",
  history: "Информационная страница о хранении истории. Для цифр портфеля используйте summary JSON и reports JSON.",
  agents: "Информационная страница об AI agents. Для ответа агенту используйте promptHint и activeReportContext.",
  ops: "Информационная страница об эксплуатации, trace id, audit и replay.",
  architecture: "Информационная страница целевой архитектуры. Используйте как описание системы, а не как источник финансовых цифр.",
};

const AI_EXCEL_TRANSFER_GUIDE = [
  "Чтобы передать Excel в приложение, найдите input[data-ai-file-input='portfolio-excel'].",
  "Установите в этот file input один или несколько файлов .xls/.xlsx через браузерный механизм загрузки файлов.",
  "После выбора файлов приложение само отправит multipart/form-data POST /api/analyze с полем files.",
  "Дождитесь, пока кнопка перестанет показывать 'Разбираю...', затем читайте section[data-ai-agent-context='portfolio'].",
  "Если нужно загрузить дневной и месячный отчеты, передайте оба файла одновременно в один input: multiple=true.",
];

const DEFAULT_REPORT_FILTERS = {
  preset: "all",
  dateFrom: "",
  dateTo: "",
  assetClasses: ["cash", "stocks", "funds", "bonds"],
  industries: [],
};

const PERIOD_PRESETS = [
  ["1m", "1М", 1],
  ["3m", "3М", 3],
  ["6m", "6М", 6],
  ["ytd", "YTD", "ytd"],
  ["1y", "1Г", 12],
  ["all", "Всё время", "all"],
];

const ASSET_CLASS_OPTIONS = [
  ["cash", "Денежные средства"],
  ["stocks", "Акции"],
  ["funds", "Фонды"],
  ["bonds", "Облигации"],
];

const INDUSTRY_RULES = [
  ["Финансы", /\b(sber|sberp|vtbr|moex|tcsg|tcs|reni|uwgn)\b|сбер|втб|московск.*бирж|тинькофф|т-банк|ренессанс|страх/i],
  ["Нефтегаз", /\b(gazp|lkoh|rosn|tatn|tatnp|nvtk|sngs|sngsp|trnfp|banep|bane)\b|газпром|лукойл|роснефт|татнефт|новатэк|сургутнефтегаз|транснефт|башнефт|нефт|газ/i],
  ["Металлы и добыча", /\b(gmkn|rual|alrs|plzl|chmf|nlmk|magn|selg|poly|polym)\b|норник|норильск|русал|алрос|полюс|северстал|нлмк|магнитогорск|металл|сталь|алюмин|золот|алмаз|добыч/i],
  ["Химия и удобрения", /\b(phor|akrn|kuaz)\b|фосагро|акрон|куйбышевазот|удобрен|хими/i],
  ["Технологии", /\b(yndx|ozon|vkco|posi|hhru|sftl|astr)\b|яндекс|озон|vk|вк|positive|позитив|headhunter|softline|софтлайн|астра|технолог|software|it\b/i],
  ["Потребсектор", /\b(mgnt|five|fixp|lenta|dets|obie)\b|магнит|x5|пятерочк|fix price|лента|детский мир|ритейл|потреб/i],
  ["Телеком", /\b(mtss|rtkm|rtkmp)\b|мтс|ростелеком|телеком|связ/i],
  ["Электроэнергетика", /\b(hydr|irao|fees|mrkc|mrkp|mrkv|mrky|msng|tgka|tgkb)\b|русгидро|интер рао|фск|мрск|мосэнерго|электроэнерг|генерац/i],
  ["Недвижимость", /\b(pikk|smlt|etln|lsrg)\b|пик|самолет|эталон|лср|недвиж|девелоп/i],
  ["Транспорт", /\b(aflt|flot|gltr|fesh)\b|аэрофлот|совкомфлот|globaltrans|транспорт|порт/i],
];

const DOWNLOAD_LINKS = [
  ["Windows", "https://github.com/PonomarevRA/hp-ai-demo/raw/main/release/historic-portfolio-ai-windows.zip", "win-x64"],
  ["Mac Apple Silicon", "https://github.com/PonomarevRA/hp-ai-demo/raw/main/release/historic-portfolio-ai-mac-arm64.zip", "osx-arm64"],
  ["Mac Intel", "https://github.com/PonomarevRA/hp-ai-demo/raw/main/release/historic-portfolio-ai-mac-x64.zip", "osx-x64"],
];

const FORMULAS = {
  pnl: {
    title: "PnL",
    formula: "PnL = Стоимость на конец - Стоимость на начало - Net cash flow",
    text: "Финансовый результат периода. В итоговом периоде берется только непересекающаяся цепочка отчетов, чтобы не задваивать результат.",
  },
  roi: {
    title: "ROI",
    formula: "ROI = PnL / Стоимость на начало * 100%",
    text: "Показывает доходность относительно начальной стоимости портфеля.",
  },
  mwr: {
    title: "MWR",
    formula: "MWR = PnL / (Start value + Σ CashFlowᵢ × (D - dᵢ) / D) × 100%",
    text: "Методология Modified Dietz из BCS-документации: денежные потоки ДС и ЦБ взвешиваются по дню операции внутри периода.",
  },
  twr: {
    title: "TWR",
    formula: "TWR = Π(1 + rᵢ) - 1",
    text: "Считает доходность цепочки периодов без задвоения пересекающихся отчетов.",
  },
  maxDrawdown: {
    title: "Max drawdown",
    formula: "Drawdown = (Cumulative value - Peak value) / Peak value * 100%",
    text: "Максимальное падение от предыдущего пика накопленной доходности.",
  },
  volatility: {
    title: "Volatility",
    formula: "Volatility = standard deviation(period returns)",
    text: "Разброс периодных доходностей. Чем больше отчетов, тем надежнее оценка.",
  },
  sharpe: {
    title: "Sharpe",
    formula: "Sharpe = Average return / Volatility",
    text: "Risk-free rate сейчас принят равным 0%. Позже можно добавить настройку ставки.",
  },
  sortino: {
    title: "Sortino",
    formula: "Sortino = Average return / Downside deviation",
    text: "Похож на Sharpe, но штрафует только отрицательные отклонения.",
  },
  feeToPnl: {
    title: "Комиссии / PnL",
    formula: "Fee drag = |Комиссии и налоги| / |PnL| * 100%",
    text: "Показывает, какую часть результата съели комиссии и налоги.",
  },
  feeToPortfolio: {
    title: "Комиссии / портфель",
    formula: "Fee to portfolio = |Комиссии и налоги| / Стоимость портфеля * 100%",
    text: "Комиссионная нагрузка относительно размера портфеля.",
  },
  turnover: {
    title: "Turnover",
    formula: "Turnover = Оборот сделок / Стоимость портфеля * 100%",
    text: "Оценка торговой активности за период.",
  },
  incomeYield: {
    title: "Income yield",
    formula: "Income yield = Купоны и дивиденды / Start value * 100%",
    text: "Доходность купонных и дивидендных выплат за период.",
  },
  incomeShareOfReturn: {
    title: "Доля дохода",
    formula: "Income share = Купоны и дивиденды / |PnL| * 100%",
    text: "Показывает, какая часть результата пришла из выплат.",
  },
  top1Concentration: {
    title: "Top-1 concentration",
    formula: "Top-1 = крупнейшая позиция / сумма позиций * 100%",
    text: "Концентрация портфеля в самой крупной позиции.",
  },
  top3Concentration: {
    title: "Top-3 concentration",
    formula: "Top-3 = сумма 3 крупнейших позиций / сумма позиций * 100%",
    text: "Концентрация портфеля в трех крупнейших позициях.",
  },
  top5Concentration: {
    title: "Top-5 concentration",
    formula: "Top-5 = сумма 5 крупнейших позиций / сумма позиций * 100%",
    text: "Концентрация портфеля в пяти крупнейших позициях.",
  },
  rubExposure: {
    title: "RUB exposure",
    formula: "RUB exposure = рублевые активы / сумма активов * 100%",
    text: "Оценка рублевой экспозиции по площадкам и идентификаторам активов.",
  },
  usdExposure: {
    title: "USD exposure",
    formula: "USD exposure = долларовые активы / сумма активов * 100%",
    text: "Оценка долларовой экспозиции по US/USMarkets/USD признакам.",
  },
  otherCurrencyExposure: {
    title: "Other exposure",
    formula: "Other = 100% - RUB exposure - USD exposure",
    text: "Оставшаяся часть портфеля после классификации RUB/USD.",
  },
  fxImpact: {
    title: "FX impact",
    formula: "FX impact ≈ изменение валютных строк из отчета",
    text: "Приближенная оценка валютного эффекта. Для точности нужна отдельная валютная переоценка по каждой позиции.",
  },
  realizedPnl: {
    title: "Realized PnL",
    formula: "Realized PnL ≈ сделки + купоны/дивиденды - комиссии/налоги",
    text: "Приближенная оценка, потому что отчет не всегда содержит цену входа по каждой позиции.",
  },
  unrealizedPnl: {
    title: "Unrealized PnL",
    formula: "Unrealized PnL = Total PnL - Realized PnL",
    text: "Оценка нереализованного результата по остаточной разнице.",
  },
  tokenCost: {
    title: "Стоимость обработки ИИ",
    formula: "Cost = reports × calls × ((inputTokens / 1 000 000 × inputPrice) + (outputTokens / 1 000 000 × outputPrice))",
    text: "На странице используется учебный расчет. Реальные input/output цены нужно хранить в конфиге модели и обновлять при смене провайдера.",
  },
  tokenSaving: {
    title: "Как экономятся токены",
    formula: "Экономия = не отправлять сырой Excel + кэшировать агрегаты + давать агенту только нужный JSON",
    text: "Самая дорогая ошибка - каждый раз отдавать модели полный отчет и просить ее заново считать числа.",
  },
};

const INFO_PAGES = {
  scale: {
    eyebrow: "500 000 investors",
    nav: "Масштаб",
    title: "Как масштабировать решение на 500 000 человек",
    lead: "Главная идея простая: пользователь загружает отчет, расчет уходит в очередь, результат сохраняется как готовый снимок, а ИИ подключается только там, где он действительно нужен.",
    stat: "500k",
    statLabel: "пользователей без ручной обработки",
    cards: [
      {
        title: "Разделить систему на слои",
        text: "Фронт отвечает за загрузку и просмотр. API принимает файлы. Отдельные worker-сервисы считают метрики. База хранит историю и готовые результаты.",
      },
      {
        title: "Считать отчеты асинхронно",
        text: "Пользователь не ждет в браузере. Файл попадает в очередь, расчет выполняется в фоне, страница показывает статус: загружено, считается, готово.",
      },
      {
        title: "Кэшировать готовые периоды",
        text: "Если отчет уже разобран, не надо считать его заново. Для графиков хранятся агрегаты: день, месяц, год, весь период.",
      },
      {
        title: "ИИ запускать дозированно",
        text: "Модель не должна пересчитывать цифры. Она получает уже проверенные метрики и объясняет их человеческим языком.",
      },
    ],
    steps: [
      ["1", "Upload API", "Принимает Excel, проверяет формат, кладет файл в защищенное хранилище."],
      ["2", "Queue", "Очередь сглаживает пики: утром может быть 10 000 загрузок, workers разбирают их постепенно."],
      ["3", "Analytics workers", "Считают PnL, ROI, TWR, риски, концентрацию, комиссии и валютную экспозицию."],
      ["4", "AI gateway", "Передает агенту только нужный контекст: цифры, периоды, ограничения и вопрос пользователя."],
    ],
  },
  history: {
    eyebrow: "since 2022",
    nav: "История",
    title: "Как включить историю отчетов с 2022 года",
    lead: "Нужно хранить не только последний Excel, а цепочку периодов. Тогда можно строить доходность за годы, видеть просадки, комиссии и изменения портфеля во времени.",
    stat: "2022 → сегодня",
    statLabel: "единая временная линия",
    cards: [
      {
        title: "Каждый отчет получает даты",
        text: "Система читает начало и конец периода. Если периоды пересекаются, итоговая цепочка выбирает непересекающиеся отчеты, чтобы не задвоить PnL.",
      },
      {
        title: "Данные нормализуются",
        text: "Названия колонок и листов приводятся к понятной модели: позиции, сделки, комиссии, доходы, денежные потоки.",
      },
      {
        title: "Собираются годовые срезы",
        text: "Можно быстро открыть 2022, 2023, 2024, 2025 и текущий год, не пересчитывая всю историю каждый раз.",
      },
      {
        title: "Ошибки видны пользователю",
        text: "Если отчет перекрывает другой или не содержит нужных дат, интерфейс показывает это простым статусом.",
      },
    ],
    steps: [
      ["A", "Raw files", "Оригинальные Excel сохраняются как источник истины."],
      ["B", "Normalized ledger", "Все операции превращаются в единую таблицу событий по датам."],
      ["C", "Period snapshots", "Для каждого периода сохраняется итог: стоимость, PnL, доходность, риски."],
      ["D", "Timeline UI", "Пользователь переключается между годами, месяцами и отдельными отчетами."],
    ],
  },
  agents: {
    eyebrow: "AI agents",
    nav: "ИИ-агенты",
    title: "Как правильно интегрировать отчеты с ИИ-агентами",
    lead: "ИИ-агент не должен угадывать цифры из Excel. Надежная схема: расчет делает backend, агент получает структурированный контекст и помогает объяснять, сравнивать и задавать уточняющие вопросы.",
    stat: "agent-ready",
    statLabel: "цифры проверены до вызова ИИ",
    cards: [
      {
        title: "Агент видит готовую сводку",
        text: "В prompt передаются PnL, ROI, комиссии, риски, топ-позиции и ограничения расчета. Сам файл целиком отправлять в модель не обязательно.",
      },
      {
        title: "Есть разные роли агентов",
        text: "Один агент объясняет результат, второй ищет риски, третий готовит письмо клиенту, четвертый отвечает на вопросы по методологии.",
      },
      {
        title: "Нужны guardrails",
        text: "Агент не дает инвестиционный совет как приказ. Он объясняет данные, показывает риски и явно пишет, где расчет приблизительный.",
      },
      {
        title: "Ответы должны ссылаться на метрики",
        text: "Пользователь должен видеть, из каких чисел сделан вывод: период, значение, формула и источник.",
      },
    ],
    steps: [
      ["1", "Metrics context", "Backend собирает компактный JSON: период, метрики, топ-активы, комиссии, риски."],
      ["2", "Agent task", "Пользователь выбирает задачу: объяснить PnL, найти риски, сравнить годы, подготовить комментарий."],
      ["3", "AI response", "Модель отвечает простым языком и не меняет исходные цифры."],
      ["4", "Audit trail", "Сохраняются prompt, версия метрик и дата ответа, чтобы потом можно было проверить вывод."],
    ],
  },
  ops: {
    eyebrow: "support & observability",
    nav: "Эксплуатация",
    title: "Сопровождение, наблюдаемость и логирование",
    lead: "Этот слой нужен, чтобы продукт можно было поддерживать: видеть ошибки, объяснять пользователю спорные цифры, контролировать стоимость ИИ и воспроизводить расчет.",
    stat: "audit ready",
    statLabel: "расчеты можно проверить и повторить",
    cards: [
      {
        title: "Поддержка видит контекст",
        text: "Оператору нужны файл, период, статус разбора, выбранная цепочка отчетов, версии формул и последние действия пользователя.",
      },
      {
        title: "Метрики показывают здоровье",
        text: "Система должна показывать latency, ошибки парсинга, стоимость вызовов ИИ, расход токенов и долю неуспешных отчетов.",
      },
      {
        title: "Логи помогают расследовать",
        text: "Логируются id файла, hash, версия парсера, версия prompt, выбранные периоды и результат проверки, а не лишние персональные данные.",
      },
      {
        title: "Расчеты можно повторить",
        text: "Если пользователь задает вопрос по цифре, команда должна воспроизвести расчет на той же версии данных и формул.",
      },
    ],
    steps: [
      ["1", "Trace id", "Каждая загрузка получает id, по которому связываются файл, расчет, вызов ИИ и ответ пользователю."],
      ["2", "Metrics", "Собираются технические метрики: время обработки, ошибки, токены, стоимость, успешность парсинга."],
      ["3", "Audit log", "Хранится технический след: версии формул, prompt, модель, выбранные периоды и результат."],
      ["4", "Replay", "Расчет можно повторить на том же файле и понять, где появилась разница."],
    ],
  },
  architecture: {
    eyebrow: "target architecture",
    nav: "Архитектура",
    title: "Целевая архитектура сервиса портфельной аналитики",
    lead: "Блок-схема показывает целевую архитектуру как последовательный поток: вход пользователя, расчетный конвейер, витрины данных, ИИ-контур и эксплуатация. Нажмите на любой блок, чтобы увидеть его роль простым языком.",
    stat: "reference",
    statLabel: "схема для продукта, а не разового чат-бота",
    cards: [
      {
        title: "Файл не идет сразу в ИИ",
        text: "Сначала отчет попадает в upload API, проходит проверки и сохраняется как источник. Это дает повторяемость и контроль доступа.",
      },
      {
        title: "Расчеты отделены от объяснений",
        text: "PnL, ROI, TWR, комиссии и риски считает backend. ИИ получает готовые цифры и помогает пользователю понять результат.",
      },
      {
        title: "История хранится как данные",
        text: "Отчеты с 2022 года превращаются в нормализованные события и снимки периодов, поэтому графики не пересчитываются с нуля.",
      },
      {
        title: "Поддержка видит технический след",
        text: "Trace id связывает файл, расчет, prompt, ответ агента и логи. Это нужно для разбора ошибок и аудита.",
      },
    ],
    steps: [
      ["1", "Frontend", "Пользователь загружает Excel, выбирает период, открывает графики и задает вопрос агенту."],
      ["2", "Upload API", "Проверяет файл, размер, формат, права доступа и создает trace id для всей обработки."],
      ["3", "Analytics workers", "Асинхронно парсят отчеты, считают метрики и сохраняют готовые результаты."],
      ["4", "AI gateway", "Отдает агентам только компактный проверенный контекст: метрики, периоды, ограничения и вопрос."],
    ],
  },
};

const ARCHITECTURE_BLOCKS = [
  {
    id: "frontend",
    title: "Frontend",
    layer: "Клиентский слой",
    icon: "layers",
    step: "1",
    x: 4,
    y: 10,
    text: "Интерфейс загрузки отчетов, просмотра графиков, выбора периодов и запуска ИИ-объяснений. Он не считает финансовые формулы сам, а показывает результат API.",
    why: "Так проще менять дизайн, версии V1/V2/V3 и сценарии пользователя, не ломая расчетную часть.",
  },
  {
    id: "api",
    title: "Backend API",
    layer: "Прием запросов",
    icon: "queue",
    step: "2",
    x: 23,
    y: 10,
    text: "Принимает Excel, проверяет авторизацию, ограничения размера, тип файла и создает trace id. Возвращает пользователю статус обработки.",
    why: "API защищает внутренние сервисы от случайных файлов, повторных запросов и резких пиков нагрузки.",
  },
  {
    id: "queue",
    title: "Queue",
    layer: "Асинхронная обработка",
    icon: "queue",
    step: "3",
    x: 42,
    y: 10,
    text: "Очередь раскладывает задания на обработку отчетов. Если 10 000 пользователей загрузили файлы одновременно, workers забирают задачи постепенно.",
    why: "Пользователь не ждет долгий HTTP-запрос, а система не падает от пиков.",
  },
  {
    id: "workers",
    title: "Analytics workers",
    layer: "Расчеты",
    icon: "pulse",
    step: "4",
    x: 61,
    y: 10,
    text: "Парсят Excel, нормализуют строки, считают PnL, ROI, MWR, TWR, drawdown, комиссии, доходы, концентрацию и валютную экспозицию.",
    why: "Это детерминированный слой: один и тот же файл на той же версии формул дает тот же результат.",
  },
  {
    id: "storage",
    title: "Raw file storage",
    layer: "Источник истины",
    icon: "cache",
    step: "raw",
    x: 23,
    y: 45,
    text: "Хранит оригинальные Excel-файлы, hash, владельца, дату загрузки и связь с trace id. Доступ к файлам должен быть ограничен.",
    why: "Если пользователь спорит с цифрой, можно повторить расчет на исходном файле.",
  },
  {
    id: "ledger",
    title: "Normalized ledger",
    layer: "История с 2022",
    icon: "timeline",
    step: "5",
    x: 42,
    y: 45,
    text: "Единая модель событий: позиции, сделки, комиссии, купоны, дивиденды, денежные потоки и периоды отчетов.",
    why: "На этой базе строятся годовые срезы, непересекающиеся периоды и графики за длинную историю.",
  },
  {
    id: "snapshots",
    title: "Metric snapshots",
    layer: "Готовые витрины",
    icon: "split",
    step: "6",
    x: 61,
    y: 45,
    text: "Сохраняет готовые агрегаты: отчет, месяц, год, весь период. Фронт и агенты читают эти снимки вместо повторного разбора Excel.",
    why: "Это ускоряет страницу, снижает стоимость ИИ и делает цифры стабильными.",
  },
  {
    id: "ai",
    title: "AI gateway",
    layer: "ИИ-контур",
    icon: "nodes",
    step: "7",
    x: 80,
    y: 45,
    text: "Собирает короткий контекст для агента: выбранный период, метрики, ограничения, ссылки на источники и вопрос пользователя.",
    why: "ИИ не пересчитывает таблицы, а объясняет проверенные данные. Это дешевле, быстрее и безопаснее.",
  },
  {
    id: "agents",
    title: "AI agents",
    layer: "Объяснения",
    icon: "nodes",
    step: "8",
    x: 80,
    y: 10,
    text: "Агенты объясняют результат, ищут риски, готовят комментарии и отвечают на вопросы по методологии.",
    why: "Роли можно разделять: меньше prompt, проще тесты, ниже стоимость и понятнее контроль качества.",
  },
  {
    id: "ops",
    title: "Ops, logs, audit",
    layer: "Эксплуатация",
    icon: "pulse",
    step: "ops",
    x: 80,
    y: 70,
    text: "Собирает логи, метрики, стоимость ИИ, ошибки парсинга, версии формул, версии prompt и возможность replay.",
    why: "Без этого поддержку невозможно масштабировать: команда не поймет, где ошибка и почему изменилась цифра.",
  },
];

const ARCHITECTURE_LINKS = [
  ["frontend", "api"],
  ["api", "queue"],
  ["queue", "workers"],
  ["api", "storage"],
  ["storage", "ledger"],
  ["workers", "ledger"],
  ["ledger", "snapshots"],
  ["snapshots", "ai"],
  ["ai", "agents"],
  ["ai", "ops"],
];

const INFO_ANTI_PATTERNS = [
  {
    title: "Отправлять весь Excel в ИИ каждый раз",
    bad: "Модель читает тысячи лишних ячеек, расходует много input-токенов и все равно может пропустить важную строку.",
    better: "Backend один раз разбирает отчет, сохраняет метрики и передает агенту короткий JSON.",
  },
  {
    title: "Просить ИИ посчитать PnL и ROI",
    bad: "Расчеты становятся непроверяемыми: модель может ошибиться в формуле, округлении или задвоить пересекающийся период.",
    better: "Детерминированные расчеты делает сервис, а ИИ объясняет уже проверенные цифры.",
  },
  {
    title: "Делать одного агента на все задачи без ролей",
    bad: "Prompt быстро разрастается: туда кладут методологию, риск-проверки, стиль ответа и историю. Это дороже и хуже контролируется.",
    better: "Разделить роли: объяснение результата, поиск рисков, коммуникация с клиентом. Каждый агент получает только нужный контекст.",
  },
  {
    title: "Не хранить историю и кэш",
    bad: "При каждом вопросе заново читаются старые отчеты с 2022 года, растут задержки и стоимость токенов.",
    better: "Сохранять нормализованные операции, периодные снимки и готовые ответы для повторных вопросов.",
  },
];

const AGENT_STRATEGY = [
  {
    title: "Агент объяснения",
    text: "Переводит PnL, ROI, комиссии и риски на человеческий язык. Не считает цифры сам.",
  },
  {
    title: "Агент контроля рисков",
    text: "Ищет концентрацию, просадки, валютную экспозицию, необычные комиссии и пересечения периодов.",
  },
  {
    title: "Агент коммуникации",
    text: "Готовит письмо, отчет для клиента или краткий executive summary в нужном стиле.",
  },
];

const COMPARISON_BLOCKS = [
  {
    title: "Сервис с ИИ vs чат-бот",
    left: "Чат-бот отвечает в диалоге и часто видит только то, что пользователь вставил в сообщение.",
    right: "Сервис хранит файлы, даты, историю, версии расчетов, права доступа и audit trail.",
  },
  {
    title: "Сервис с ИИ vs расчеты прямо в ИИ",
    left: "Если ИИ сам считает из Excel, сложно доказать, откуда взялась цифра и почему она изменилась.",
    right: "Backend считает формулы повторяемо, а ИИ объясняет результат, находит риски и задает уточняющие вопросы.",
  },
];

const OPS_BLOCKS = [
  {
    title: "Поддержка пользователей",
    metric: "ticket ready",
    text: "Оператор должен открыть отчет пользователя и сразу увидеть файл, период, статус разбора, исключенные пересечения и последние действия.",
    aiOnly: "Если все считалось внутри ИИ, поддержке приходится читать prompt и ответ модели вручную. Это медленно и плохо масштабируется.",
  },
  {
    title: "Наблюдаемость",
    metric: "latency / errors / cost",
    text: "Нужны метрики: время загрузки, время парсинга, ошибки по типам отчетов, latency агента, input/output tokens и стоимость вызова.",
    aiOnly: "Если отправлять все в ИИ одним запросом, видно только общую задержку. Непонятно, где проблема: файл, формула, модель или сеть.",
  },
  {
    title: "Логирование",
    metric: "audit trail",
    text: "Лог должен хранить не персональные лишние данные, а технический след: id файла, hash, период, версию формулы, версию prompt и результат проверки.",
    aiOnly: "Можно логировать prompt, но это дорого, небезопасно и неудобно: в нем могут быть лишние персональные данные и тысячи строк таблиц.",
  },
  {
    title: "Разбор ошибок",
    metric: "replay",
    text: "Хорошая система умеет повторить расчет на том же файле и той же версии формул, чтобы воспроизвести проблему.",
    aiOnly: "Ответ модели недетерминирован: даже с тем же prompt можно получить другое объяснение или округление. Для финансовых расчетов это слабое место.",
  },
  {
    title: "Можно ли считать внутри ИИ",
    metric: "только для прототипа",
    text: "Для демо можно: загрузить файл в ИИ и попросить посчитать. Для продукта лучше нельзя: нужны повторяемость, аудит, стоимость, поддержка и контроль качества.",
    aiOnly: "Компромисс: ИИ может помогать распознавать нестандартные поля, но финальные цифры должны проходить через проверяемые функции backend.",
  },
];

const COST_MODULES = [
  {
    id: "parser",
    title: "Парсер и расчет метрик",
    on: "ИИ получает 1 500 токенов готовой сводки.",
    off: "В ИИ уходит сырой отчет: около 120 000 input-токенов.",
    inputOn: 1500,
    inputOff: 120000,
    outputOn: 700,
    outputOff: 1200,
  },
  {
    id: "history",
    title: "История и кэш с 2022 года",
    on: "Повторные вопросы берут готовые агрегаты.",
    off: "Каждый вопрос заново тащит историю: +18 000 токенов.",
    inputOn: 900,
    inputOff: 18000,
    outputOn: 200,
    outputOff: 400,
  },
  {
    id: "router",
    title: "Роутер агентов",
    on: "Задача идет только нужному агенту.",
    off: "Один универсальный агент получает лишние инструкции.",
    inputOn: 600,
    inputOff: 6500,
    outputOn: 500,
    outputOff: 1200,
  },
  {
    id: "compression",
    title: "Короткий контекст",
    on: "В prompt попадают только метрики и ссылки на источники.",
    off: "В prompt копируются таблицы и подробные строки операций.",
    inputOn: 800,
    inputOff: 22000,
    outputOn: 300,
    outputOff: 700,
  },
];

const COST_ASSUMPTIONS = {
  reports: 500000,
  callsPerReport: 1.4,
  inputPricePerMillion: 0.5,
  outputPricePerMillion: 2,
};

const PAGE_ICON = {
  scale: "layers",
  history: "timeline",
  agents: "nodes",
  ops: "pulse",
  architecture: "split",
};

const CARD_ICONS = ["layers", "queue", "cache", "nodes"];

function formatRub(value) {
  return rub.format(Number(value || 0)).replace("RUB", "₽");
}

function signedRub(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatRub(numeric)}`;
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${plain.format(numeric)}%`;
}

function formatUsd(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function compactNumber(value) {
  return new Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function estimateAiCost(enabled) {
  const calls = COST_ASSUMPTIONS.reports * COST_ASSUMPTIONS.callsPerReport;
  const inputPerCall = COST_MODULES.reduce((sum, item) => sum + (enabled[item.id] ? item.inputOn : item.inputOff), 0);
  const outputPerCall = COST_MODULES.reduce((sum, item) => sum + (enabled[item.id] ? item.outputOn : item.outputOff), 0);
  const inputTokens = calls * inputPerCall;
  const outputTokens = calls * outputPerCall;
  const total = inputTokens / 1_000_000 * COST_ASSUMPTIONS.inputPricePerMillion
    + outputTokens / 1_000_000 * COST_ASSUMPTIONS.outputPricePerMillion;
  return { calls, inputTokens, outputTokens, total };
}

function classForValue(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return "muted";
}

function almostSamePercent(left, right, tolerance = 0.01) {
  return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= tolerance;
}

function buildReturnEqualityNote({ roi, mwr, twr, netCashFlow }) {
  const hasTwr = twr !== null && twr !== undefined && Number.isFinite(Number(twr));
  const roiMwrSame = almostSamePercent(roi, mwr);
  const allSame = hasTwr && roiMwrSame && almostSamePercent(roi, twr);

  if (!roiMwrSame && !allSame) {
    return null;
  }

  const hasMaterialFlow = Math.abs(Number(netCashFlow || 0)) > 0.01;
  if (allSame) {
    return {
      title: "ROI, MWR и TWR совпали",
      text: "Такое возможно, когда выбран один период или в цепочке нет существенных пополнений и выводов: все три подхода фактически сводятся к доходности PnL к начальной стоимости.",
      hint: hasMaterialFlow
        ? "Если внутри периода были крупные движения денег, совпадение может быть эффектом округления или недостатка дат потоков в отчете."
        : "При нескольких периодах TWR может остаться рядом с ROI/MWR после округления до сотых процента.",
    };
  }

  return {
    title: "ROI и MWR совпали",
    text: "Это нормально, если net flow равен нулю или слишком мал относительно портфеля: MWR получает почти тот же знаменатель, что и ROI.",
    hint: "TWR начнет отличаться на цепочке из нескольких периодов, когда доходности периодов различаются или есть заметные денежные потоки.",
  };
}

function ReturnEqualityNote({ roi, mwr, twr, netCashFlow }) {
  const note = buildReturnEqualityNote({ roi, mwr, twr, netCashFlow });
  if (!note) {
    return null;
  }

  return h("section", { className: "returnEqualityNote" },
    h("strong", null, note.title),
    h("p", null, note.text),
    h("small", null, note.hint)
  );
}

function buildAiAgentContext(data, report, screen, activeReport) {
  const summary = data?.summary;
  const includedReports = data ? getIncludedReports(data) : [];
  const topAssets = report?.assets?.slice(0, 10).map((row) => ({
    title: row.title,
    subtitle: row.subtitle,
    valueRub: Number(row.value || 0),
  })) || [];

  return {
    purpose: "Hidden machine-readable context for browser/AI agents. Do not show this block to end users.",
    currentScreen: screen,
    screenGuide: AI_SCREEN_GUIDES[screen] || AI_SCREEN_GUIDES.home,
    excelUploadGuide: AI_EXCEL_TRANSFER_GUIDE,
    selectors: {
      uploadInput: "input[data-ai-file-input='portfolio-excel']",
      uploadButton: "[data-ai-action='upload-excel']",
      agentContext: "section[data-ai-agent-context='portfolio']",
      metric: "[data-ai-metric]",
    },
    formulas: {
      pnl: "PnL = total value change - net cash flow",
      roi: "ROI = PnL / start value * 100",
      mwr: "MWR = PnL / (start value + Σ cashFlow_i * (D - d_i) / D) * 100",
      twr: "TWR = product(1 + periodReturn_i) - 1; periodReturn_i = period PnL / period start value",
    },
    interpretationRules: [
      "Use PnL, ROI, MWR and TWR from JSON, not from visual chart coordinates.",
      "portfolioChange is total change in portfolio value; pnl excludes net cash flow.",
      "netCashFlow is signed: positive for inflow, negative for withdrawal.",
      "MWR follows BCS Modified Dietz methodology with date-weighted cash flows when dates are available.",
      "TWR is supplemental analytics across the non-overlapping report chain, not the primary BCS portfolio return.",
      "If ROI/MWR/TWR are equal after rounding, explain that this can happen with zero or immaterial cash flows, one period, or rounding.",
    ],
    activeReportIndex: activeReport,
    hasData: Boolean(data && report),
    summary: summary ? {
      portfolioValueRub: Number(summary.portfolioValue || 0),
      portfolioChangeRub: Number(summary.portfolioChange || 0),
      assetChangeRub: Number(summary.assetChange || 0),
      couponsAndDividendsRub: Number(summary.couponsAndDividends || 0),
      commissionsAndTaxesRub: Number(summary.commissionsAndTaxes || 0),
      depositsAndWithdrawalsRub: Number(summary.depositsAndWithdrawals || 0),
      pnlRub: Number(summary.metrics?.pnl || 0),
      roiPercent: Number(summary.metrics?.roi || 0),
      mwrPercent: Number(summary.metrics?.mwr || 0),
      twrPercent: Number(summary.advancedMetrics?.twr || 0),
      maxDrawdownPercent: Number(summary.advancedMetrics?.maxDrawdown || 0),
      volatilityPercent: Number(summary.advancedMetrics?.volatility || 0),
      sharpe: Number(summary.advancedMetrics?.sharpe || 0),
      sortino: Number(summary.advancedMetrics?.sortino || 0),
      netCashFlowRub: Number(summary.metrics?.netCashFlow || 0),
      weightedCashFlowRub: Number(summary.metrics?.weightedCashFlow || 0),
    } : null,
    activeReport: report ? {
      fileName: report.fileName,
      sheetName: report.sheetName,
      period: report.period,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      periodDays: Number(report.periodDays || 0),
      includedInSummary: Boolean(report.includedInSummary),
      periodStatus: report.periodStatus,
      portfolioValueRub: Number(report.portfolioValue || 0),
      portfolioChangeRub: Number(report.portfolioChange || 0),
      pnlRub: Number(report.metrics?.pnl || 0),
      roiPercent: Number(report.metrics?.roi || 0),
      mwrPercent: Number(report.metrics?.mwr || 0),
      startValueRub: Number(report.metrics?.startValue || 0),
      endValueRub: Number(report.metrics?.endValue || 0),
      netCashFlowRub: Number(report.metrics?.netCashFlow || 0),
      weightedCashFlowRub: Number(report.metrics?.weightedCashFlow || 0),
      assetChangeRub: Number(report.assetChange || 0),
      couponsAndDividendsRub: Number(report.couponsAndDividends || 0),
      commissionsAndTaxesRub: Number(report.commissionsAndTaxes || 0),
      depositsAndWithdrawalsRub: Number(report.depositsAndWithdrawals || 0),
      topAssets,
    } : null,
    reports: data?.reports?.map((item, index) => ({
      index,
      fileName: item.fileName,
      period: item.period,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      includedInSummary: Boolean(item.includedInSummary),
      periodStatus: item.periodStatus,
      pnlRub: Number(item.metrics?.pnl || 0),
      roiPercent: Number(item.metrics?.roi || 0),
      mwrPercent: Number(item.metrics?.mwr || 0),
      netCashFlowRub: Number(item.metrics?.netCashFlow || 0),
    })) || [],
    includedReportChain: includedReports.map((item) => item.fileName),
    promptHint: data && report ? buildAgentPrompt(data, report) : "Upload Excel reports first, then read this field again.",
  };
}

function AiAgentContext({ data, report, screen, activeReport }) {
  const context = buildAiAgentContext(data, report, screen, activeReport);
  return h("section", {
    className: "aiAgentContext",
    "data-ai-agent-context": "portfolio",
    "data-ai-current-screen": screen,
  },
    h("h2", null, "AI Agent Context: Historic Portfolio"),
    h("p", null, context.screenGuide),
    h("p", null, "Excel upload: ", AI_EXCEL_TRANSFER_GUIDE.join(" ")),
    h("pre", null, JSON.stringify(context, null, 2))
  );
}

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [activeReport, setActiveReport] = useState(-1);
  const [reportFilters, setReportFilters] = useState(DEFAULT_REPORT_FILTERS);
  const [formulaKey, setFormulaKey] = useState(null);
  const hashScreen = location.hash.replace("#", "");
  const initialScreen = ["v1", "v2", "v3", "scale", "history", "agents", "ops", "architecture"].includes(hashScreen) ? hashScreen : "home";
  const [screen, setScreen] = useState(initialScreen);

  function go(next) {
    setScreen(next);
    history.replaceState(null, "", next === "home" ? location.pathname : `#${next}`);
  }

  async function upload(files) {
    if (!files.length) return;
    setLoading(true);
    setError("");
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));

    try {
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось разобрать отчет");
      setData(payload);
      setActiveReport(-1);
      setReportFilters(DEFAULT_REPORT_FILTERS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredData = data ? buildFilteredDashboardData(data, reportFilters) : null;
  const report = filteredData ? getActiveReport(filteredData, activeReport) : null;
  const openFormula = (key) => setFormulaKey(key);

  return h("main", { className: `shell screen-${screen}` },
    h(AiAgentContext, { data: filteredData, report, screen, activeReport }),
    h(Topbar, { data: filteredData, loading, upload, screen, go }),
    screen === "home" && h(Home, { data: filteredData, error, loading, upload, go }),
    screen === "v1" && h(VersionFrame, { title: "V1 · банковская аналитика", go },
      filteredData && report
        ? h(DashboardV1, { data: filteredData, sourceData: data, report, activeReport, setActiveReport, openFormula, reportFilters, setReportFilters })
        : h(EmptyState, { error, loading, upload })
    ),
    screen === "v2" && h(VersionFrame, { title: "V2 · investor cockpit", go },
      filteredData && report
        ? h(DashboardV2, { data: filteredData, sourceData: data, report, activeReport, setActiveReport, openFormula, reportFilters, setReportFilters })
        : h(EmptyState, { error, loading, upload })
    ),
    screen === "v3" && h(VersionFrame, { title: "V3 · metric lab", go },
      filteredData && report
        ? h(DashboardV3, { data: filteredData, sourceData: data, report, activeReport, setActiveReport, openFormula, reportFilters, setReportFilters })
        : h(EmptyState, { error, loading, upload })
    ),
    INFO_PAGES[screen] && h(InfoPage, { page: INFO_PAGES[screen], pageKey: screen, go, openFormula }),
    formulaKey && h(FormulaModal, { formulaKey, close: () => setFormulaKey(null) })
  );
}

function Topbar({ data, loading, upload, screen, go }) {
  return h("header", { className: "topbar" },
    h("button", { className: "brandButton", onClick: () => go("home"), title: "На главную" },
      h("span", { className: "brandMark" }, "H"),
      h("span", null,
        h("b", null, "Historic Portfolio"),
        h("small", null, data ? `${data.reports.length} отчет(а) загружено` : "Excel analytics")
      )
    ),
    h("nav", { className: "navPills" },
      h("button", { className: screen === "home" ? "active" : "", onClick: () => go("home") }, "Главная"),
      h("button", { className: screen === "v1" ? "active" : "", onClick: () => go("v1") }, "V1"),
      h("button", { className: screen === "v2" ? "active" : "", onClick: () => go("v2") }, "V2"),
      h("button", { className: screen === "v3" ? "active" : "", onClick: () => go("v3") }, "V3"),
      h("button", { className: screen === "scale" ? "active" : "", onClick: () => go("scale") }, "Масштаб"),
      h("button", { className: screen === "history" ? "active" : "", onClick: () => go("history") }, "История"),
      h("button", { className: screen === "agents" ? "active" : "", onClick: () => go("agents") }, "ИИ"),
      h("button", { className: screen === "ops" ? "active" : "", onClick: () => go("ops") }, "Ops"),
      h("button", { className: screen === "architecture" ? "active" : "", onClick: () => go("architecture") }, "Архитектура")
    ),
    h(UploadButton, { loading, upload })
  );
}

function UploadButton({ loading, upload, compact = false }) {
  return h("label", {
    className: `uploadButton ${loading ? "loading" : ""} ${compact ? "compact" : ""}`,
    "data-ai-action": "upload-excel",
  },
    h("input", {
      type: "file",
      accept: ".xls,.xlsx",
      multiple: true,
      "data-ai-file-input": "portfolio-excel",
      "aria-label": "Загрузить Excel отчеты портфеля",
      onChange: (event) => upload(event.target.files),
    }),
    h("span", { className: "buttonIcon" }, "↑"),
    h("span", null, loading ? "Разбираю..." : compact ? "Загрузить" : "Загрузить отчеты")
  );
}

function Home({ data, error, loading, upload, go }) {
  const summary = data?.summary;
  return h("section", { className: "homeHero" },
    h("div", { className: "homeIntro" },
      h("div", { className: "homeIntroIcon" }, h(Icon, { name: "pulse" })),
      h("p", { className: "eyebrow" }, "portfolio intelligence"),
      h("h1", null, "Загрузите брокерские отчеты и выберите формат аналитики"),
      h("p", { className: "lead" }, "V1 сохраняет привычную логику карточек. V2 добавляет investor-метрики. V3 превращает отчет в лабораторию: категории метрик управляют графиками и состоянием страницы."),
      h("div", { className: "homeActions" },
        h(UploadButton, { loading, upload }),
        data && h("button", { className: "secondaryButton", onClick: () => go("v3") }, "Открыть V3")
      ),
      h(DownloadLinks, null),
      error && h("p", { className: "error" }, error)
    ),
    h("div", { className: "homePreview" },
      h("div", { className: "portfolioTicker" },
        h("span", null, "Стоимость портфеля"),
        h("strong", null, summary ? formatRub(summary.portfolioValue) : "—")
      ),
      h("div", { className: "designCards" },
        h(DesignCard, {
          badge: "V1",
          title: "Классический анализ",
          text: "Темная банковская панель: изменение портфеля, состав результата, таблицы активов и операций.",
          metrics: data ? [
            ["PnL", signedRub(summary.metrics.pnl)],
            ["ROI", formatPercent(summary.metrics.roi)],
          ] : [["Фокус", "разбор отчета"]],
          onClick: () => go("v1"),
        }),
        h(DesignCard, {
          badge: "V2",
          title: "Investor cockpit",
          text: "Современнее и динамичнее: PnL, ROI, MWR, momentum-график, риск-сигналы и быстрый drill-down.",
          metrics: data ? [
            ["MWR", formatPercent(summary.metrics.mwr)],
            ["Активы", signedRub(summary.assetChange)],
          ] : [["Фокус", "доходность"]],
          onClick: () => go("v2"),
          featured: true,
        }),
        h(DesignCard, {
          badge: "V3",
          title: "Metric lab",
          text: "TWR, drawdown, volatility, Sharpe/Sortino, концентрация, FX и turnover с фильтрами, которые меняют графики.",
          metrics: data ? [
            ["TWR", formatPercent(summary.advancedMetrics.twr)],
            ["Max DD", formatPercent(summary.advancedMetrics.maxDrawdown)],
          ] : [["Фокус", "сценарии"]],
          onClick: () => go("v3"),
        })
      ),
      h("div", { className: "homeInfoCards" },
        Object.entries(INFO_PAGES).map(([key, page]) => h(InfoTeaser, {
          key,
          page,
          onClick: () => go(key),
        }))
      )
    )
  );
}

function DownloadLinks() {
  return h("div", { className: "downloadLinks" },
    h("span", null, "Скачать готовую сборку"),
    DOWNLOAD_LINKS.map(([label, href, meta]) => h("a", {
      key: href,
      href,
      download: "",
      title: `Скачать ${meta}`,
    },
      h("strong", null, label),
      h("small", null, meta)
    ))
  );
}

function DesignCard({ badge, title, text, metrics, onClick, featured }) {
  return h("button", { className: `designCard ${featured ? "featured" : ""}`, onClick },
    h("span", { className: "designBadge" }, badge),
    h("span", { className: "designCopy" },
      h("strong", null, title),
      h("p", null, text)
    ),
    h("div", { className: "miniMetrics" },
      metrics.map(([label, value]) => h("span", { key: label }, h("small", null, label), h("b", null, value)))
    ),
    h("span", { className: "designArrow" }, "→")
  );
}

function InfoTeaser({ page, onClick }) {
  return h("button", { className: "infoTeaser", onClick },
    h(Icon, { name: PAGE_ICON[Object.entries(INFO_PAGES).find(([, item]) => item === page)?.[0]] || "layers" }),
    h("span", null, page.nav),
    h("strong", null, page.title),
    h("small", null, page.lead),
    h("b", null, "Открыть", h("span", null, "→"))
  );
}

function InfoPage({ page, pageKey, go, openFormula }) {
  const [activeStep, setActiveStep] = useState(0);
  const step = page.steps[activeStep] || page.steps[0];
  const isOps = pageKey === "ops";
  const isArchitecture = pageKey === "architecture";

  return h("section", { className: "infoPage" },
    h("div", { className: "infoHero" },
      h("div", null,
        h("button", { className: "backButton", onClick: () => go("home"), title: "На главную" }, "←"),
        h("p", { className: "eyebrow" }, page.eyebrow),
        h("h1", null, page.title),
        h("p", null, page.lead)
      ),
      h("div", { className: "infoStat" },
        h(Icon, { name: PAGE_ICON[pageKey] || "layers" }),
        h("strong", null, page.stat),
        h("span", null, page.statLabel)
      )
    ),
    isArchitecture
      ? h(ArchitectureBlueprint, null)
      : h(PageDiagram, { page, pageKey, activeStep, setActiveStep }),
    h("div", { className: "infoLayout" },
      h("div", { className: "infoCardGrid" },
        page.cards.map((card, index) => h("article", { className: "explainCard", key: card.title },
          h(Icon, { name: CARD_ICONS[index % CARD_ICONS.length] }),
          h("h3", null, card.title),
          h("p", null, card.text)
        ))
      ),
      h("aside", { className: "flowPanel" },
        h("div", { className: "panelTitle" },
          h("h3", null, "Как это работает"),
          h("span", null, "нажмите на шаг")
        ),
        h("div", { className: "flowSteps" },
          page.steps.map((item, index) => h("button", {
            key: item[1],
            className: index === activeStep ? "active" : "",
            onClick: () => setActiveStep(index),
          },
            h(Icon, { name: CARD_ICONS[index % CARD_ICONS.length] }),
            h("span", null, item[0]),
            h("strong", null, item[1])
          ))
        ),
        h("div", { className: "flowDetail" },
          h("span", null, step[0]),
          h("strong", null, step[1]),
          h("p", null, step[2])
        )
      )
    ),
    isOps
      ? h(SupportOpsPanel, null)
      : [
          h(CostSimulator, { key: "cost", openFormula }),
          h(AntiPatternPanel, { key: "anti" }),
          h(AgentStrategyPanel, { key: "agents" }),
          h(ComparisonPanel, { key: "compare" })
        ]
  );
}

function Icon({ name }) {
  return h("span", { className: `uiIcon ${name || "layers"}`, "aria-hidden": "true" });
}

function architectureCenter(block) {
  return {
    x: block.x + 7,
    y: block.y + 6.6,
  };
}

function architecturePath(source, target) {
  const start = architectureCenter(source);
  const end = architectureCenter(target);

  if (Math.abs(start.x - end.x) < 2) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  const direction = end.x >= start.x ? 1 : -1;
  const curve = Math.max(6, Math.abs(end.x - start.x) * 0.48);
  return `M ${start.x} ${start.y} C ${start.x + curve * direction} ${start.y}, ${end.x - curve * direction} ${end.y}, ${end.x} ${end.y}`;
}

function PageDiagram({ page, pageKey, activeStep, setActiveStep }) {
  return h("section", { className: `pageDiagram ${pageKey}` },
    h("div", { className: "diagramRail" },
      page.steps.map((step, index) => h("button", {
        key: step[1],
        className: index === activeStep ? "active" : "",
        onClick: () => setActiveStep(index),
      },
        h(Icon, { name: CARD_ICONS[index % CARD_ICONS.length] }),
        h("span", null, step[1]),
        h("small", null, step[0])
      ))
    ),
    h("div", { className: "diagramMiniChart" },
      page.steps.map((step, index) => h("span", {
        key: step[1],
        className: index === activeStep ? "active" : "",
        style: { "--height": `${36 + index * 14}%` },
      }))
    )
  );
}

function ArchitectureBlueprint() {
  const [activeId, setActiveId] = useState("workers");
  const active = ARCHITECTURE_BLOCKS.find((block) => block.id === activeId) || ARCHITECTURE_BLOCKS[0];
  const blockById = Object.fromEntries(ARCHITECTURE_BLOCKS.map((block) => [block.id, block]));

  return h("section", { className: "architectureBlueprint" },
    h("div", { className: "blueprintHeader" },
      h("div", null,
        h("p", { className: "eyebrow" }, "clickable blueprint"),
        h("h2", null, "Блок-схема целевой архитектуры")
      ),
      h("span", null, "Нажмите на блок")
    ),
    h("div", { className: "blueprintGrid" },
      h("div", { className: "blueprintCanvas" },
        h("svg", { className: "blueprintLinks", viewBox: "0 0 100 92", preserveAspectRatio: "none", "aria-hidden": "true" },
          ARCHITECTURE_LINKS.map(([from, to]) => {
            const source = blockById[from];
            const target = blockById[to];
            if (!source || !target) return null;
            const activeLink = source.id === activeId || target.id === activeId;
            return h("path", {
              key: `${from}-${to}`,
              d: architecturePath(source, target),
              className: activeLink ? "active" : "",
            });
          })
        ),
        ARCHITECTURE_BLOCKS.map((block) => h("button", {
          key: block.id,
          className: `blueprintNode ${block.id === activeId ? "active" : ""}`,
          style: { left: `${block.x}%`, top: `${block.y}%` },
          onClick: () => setActiveId(block.id),
        },
          h("em", { className: "nodeBadge" }, block.step),
          h(Icon, { name: block.icon }),
          h("span", null, block.layer),
          h("strong", null, block.title)
        ))
      ),
      h("aside", { className: "blueprintDetail" },
        h(Icon, { name: active.icon }),
        h("span", null, active.layer),
        h("h3", null, active.title),
        h("p", null, active.text),
        h("strong", null, "Зачем нужен"),
        h("p", null, active.why)
      )
    )
  );
}

function CostSimulator({ openFormula }) {
  const [enabled, setEnabled] = useState(() => Object.fromEntries(COST_MODULES.map((item) => [item.id, true])));
  const estimate = estimateAiCost(enabled);
  const allOn = estimateAiCost(Object.fromEntries(COST_MODULES.map((item) => [item.id, true])));
  const allOff = estimateAiCost(Object.fromEntries(COST_MODULES.map((item) => [item.id, false])));
  const delta = estimate.total - allOn.total;
  const saving = Math.max(0, allOff.total - estimate.total);

  function toggle(id) {
    setEnabled((current) => ({ ...current, [id]: !current[id] }));
  }

  return h("section", { className: "costSimulator" },
    h("div", { className: "costSummary" },
      h("div", null,
        h("p", { className: "eyebrow" }, "token economy"),
        h("h2", null, "Нажмите на систему и посмотрите, как меняется стоимость"),
        h("p", null, "Это не прайс-лист провайдера, а понятная модель расхода токенов. Она показывает принцип: чем меньше сырого текста уходит в ИИ, тем дешевле и стабильнее сервис.")
      ),
      h("div", { className: "costNumber" },
        h(InfoButton, { metric: "tokenCost", openFormula }),
        h("span", null, "оценка за месяц"),
        h("strong", null, formatUsd(estimate.total)),
        h("small", { className: classForValue(-delta) }, delta === 0 ? "базовая архитектура" : `${delta > 0 ? "+" : ""}${formatUsd(delta)} к базовой архитектуре`)
      )
    ),
    h("div", { className: "costToggleGrid" },
      COST_MODULES.map((item) => {
        const active = enabled[item.id];
        return h("button", {
          key: item.id,
          className: active ? "active" : "inactive",
          onClick: () => toggle(item.id),
        },
          h(Icon, { name: active ? "check" : "cut" }),
          h("span", null, active ? "включено" : "выключено"),
          h("strong", null, item.title),
          h("small", null, active ? item.on : item.off)
        );
      })
    ),
    h("div", { className: "tokenBreakdown" },
      h("div", null, h("span", null, "Input tokens"), h("strong", null, compactNumber(estimate.inputTokens))),
      h("div", null, h("span", null, "Output tokens"), h("strong", null, compactNumber(estimate.outputTokens))),
      h("div", null, h("span", null, "Вызовов ИИ"), h("strong", null, compactNumber(estimate.calls))),
      h("div", null,
        h(InfoButton, { metric: "tokenSaving", openFormula }),
        h("span", null, "Экономия"),
        h("strong", null, formatUsd(saving))
      )
    )
  );
}

function AntiPatternPanel() {
  const [active, setActive] = useState(0);
  const item = INFO_ANTI_PATTERNS[active];
  return h("section", { className: "learningPanel" },
    h("div", { className: "learningList" },
      h("p", { className: "eyebrow" }, "anti-patterns"),
      h("h2", null, "Как не надо делать и почему"),
      INFO_ANTI_PATTERNS.map((pattern, index) => h("button", {
        key: pattern.title,
        className: index === active ? "active" : "",
        onClick: () => setActive(index),
      }, h(Icon, { name: index === active ? "warning" : "cut" }), pattern.title))
    ),
    h("div", { className: "learningDetail" },
      h(Icon, { name: "warning" }),
      h("span", null, "Неудачный подход"),
      h("h3", null, item.title),
      h("p", null, item.bad),
      h("strong", null, "Как лучше"),
      h("p", null, item.better)
    )
  );
}

function AgentStrategyPanel() {
  const [mode, setMode] = useState("three");
  const isThree = mode === "three";
  return h("section", { className: "agentStrategy" },
    h("div", { className: "panelTitle" },
      h("div", null,
        h("p", { className: "eyebrow" }, "agent design"),
        h("h2", null, "Почему три агента и можно ли одним")
      ),
      h("div", { className: "segmented" },
        h("button", { className: isThree ? "active" : "", onClick: () => setMode("three") }, "3 агента"),
        h("button", { className: !isThree ? "active" : "", onClick: () => setMode("one") }, "1 агент")
      )
    ),
    isThree
      ? h("div", { className: "agentCards" }, AGENT_STRATEGY.map((agent) => h("article", { key: agent.title },
          h(Icon, { name: "nodes" }),
          h("strong", null, agent.title),
          h("p", null, agent.text)
        )))
      : h("div", { className: "oneAgentBox" },
          h(Icon, { name: "nodes" }),
          h("strong", null, "Одним агентом можно обойтись на MVP"),
          h("p", null, "Но по мере роста он начинает получать слишком большой prompt: методологию, риск-проверки, стиль ответа, историю клиента и правила безопасности. Это дороже, медленнее и сложнее тестировать."),
          h("p", null, "Практичный компромисс: сначала один агент с роутингом задач, затем выделить роли, когда появятся повторяемые сценарии и требования к качеству.")
        )
  );
}

function ComparisonPanel() {
  return h("section", { className: "comparisonPanel" },
    COMPARISON_BLOCKS.map((block) => h("article", { key: block.title },
      h(Icon, { name: "split" }),
      h("h3", null, block.title),
      h("div", null,
        h("span", null, "Простой подход"),
        h("p", null, block.left)
      ),
      h("div", null,
        h("span", null, "Сервисный подход"),
        h("p", null, block.right)
      )
    ))
  );
}

function SupportOpsPanel() {
  const [active, setActive] = useState(0);
  const item = OPS_BLOCKS[active];
  return h("section", { className: "opsPanel" },
    h("div", { className: "opsIntro" },
      h("p", { className: "eyebrow" }, "support & observability"),
      h("h2", null, "Поддержка, наблюдаемость и логирование"),
      h("p", null, "В продукте важно не только посчитать отчет, но и понять, что произошло, если пользователь видит странную цифру или агент дал спорный комментарий.")
    ),
    h("div", { className: "opsGrid" },
      h("div", { className: "opsTabs" },
        OPS_BLOCKS.map((block, index) => h("button", {
          key: block.title,
          className: index === active ? "active" : "",
          onClick: () => setActive(index),
        },
          h(Icon, { name: CARD_ICONS[index % CARD_ICONS.length] }),
          h("span", null, block.metric),
          h("strong", null, block.title)
        ))
      ),
      h("article", { className: "opsDetail" },
        h(Icon, { name: "pulse" }),
        h("span", null, item.metric),
        h("h3", null, item.title),
        h("p", null, item.text),
        h("strong", null, "Если расчеты внутри ИИ"),
        h("p", null, item.aiOnly)
      )
    )
  );
}

function getActiveReport(data, activeReport) {
  if (activeReport === -1) {
    return buildVirtualReport(data);
  }
  return data.reports[activeReport] || buildVirtualReport(data);
}

function buildVirtualReport(data) {
  const summary = data.summary;
  const included = getIncludedReports(data);
  const first = included[0] || data.reports[0];
  const last = included[included.length - 1] || data.reports[data.reports.length - 1];
  return {
    fileName: "Виртуальный период",
    sheetName: "Summary",
    period: "Все периоды",
    periodStart: first?.periodStart || "",
    periodEnd: last?.periodEnd || "",
    periodDays: included.reduce((sum, report) => sum + Number(report.periodDays || 0), 0),
    includedInSummary: true,
    periodStatus: "Виртуальный период: итоговая непересекающаяся цепочка отчетов",
    portfolioValue: summary.portfolioValue,
    portfolioChange: summary.portfolioChange,
    couponsAndDividends: summary.couponsAndDividends,
    commissionsAndTaxes: summary.commissionsAndTaxes,
    depositsAndWithdrawals: summary.depositsAndWithdrawals,
    assetChange: summary.assetChange,
    metrics: summary.metrics,
    breakdown: summary.breakdown,
    assets: summary.topAssets,
    trades: summary.trades,
    incomeRows: summary.incomeRows,
    expectedIncomeRows: summary.expectedIncomeRows || [],
    commissionRows: summary.commissionRows,
    previewRows: [],
  };
}

function buildFilteredDashboardData(data, filters) {
  const bounds = getReportDateBounds(getIncludedReports(data));
  const effectiveFilters = normalizeReportFilters(filters, bounds);
  const filteredReports = getFilteredReports(data.reports, effectiveFilters)
    .map((report) => buildFilteredReport(report, effectiveFilters));

  if (!filteredReports.length) {
    return {
      ...data,
      reports: [],
      summary: buildEmptySummary(),
    };
  }

  return {
    ...data,
    reports: filteredReports,
    summary: combineReportsClient(filteredReports),
  };
}

function buildFilteredReport(report, filters) {
  const filteredReport = filterReportDetails(report, filters);
  const dateCoverage = getReportDateCoverage(report, filters);
  const needsAggregateRecalc = hasDimensionFilters(filters) || dateCoverage.ratio < 0.999;
  if (!needsAggregateRecalc) {
    return filteredReport;
  }

  return applyFilteredReportAggregates(report, filteredReport, dateCoverage);
}

function buildEmptySummary() {
  return {
    portfolioValue: 0,
    portfolioChange: 0,
    couponsAndDividends: 0,
    commissionsAndTaxes: 0,
    depositsAndWithdrawals: 0,
    assetChange: 0,
    metrics: {
      pnl: 0,
      roi: 0,
      mwr: 0,
      startValue: 0,
      endValue: 0,
      netCashFlow: 0,
      weightedCashFlow: 0,
    },
    advancedMetrics: {
      twr: 0,
      maxDrawdown: 0,
      volatility: 0,
      sharpe: 0,
      sortino: 0,
      feeToPnl: 0,
      feeToPortfolio: 0,
      incomeYield: 0,
      incomeShareOfReturn: 0,
      top1Concentration: 0,
      top3Concentration: 0,
      top5Concentration: 0,
      rubExposure: 0,
      usdExposure: 0,
      otherCurrencyExposure: 0,
      fxImpact: 0,
      turnover: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      returnSeries: [],
      drawdownSeries: [],
      riskSeries: [],
      exposureSeries: [],
      notes: [{ metric: "Filters", text: "Нет отчетов в выбранном диапазоне." }],
    },
    timeline: [],
    breakdown: [],
    topAssets: [],
    trades: [],
    incomeRows: [],
    expectedIncomeRows: [],
    commissionRows: [],
  };
}

function combineReportsClient(reports) {
  const ordered = reports.filter((report) => report.includedInSummary).sort(compareReportsByDate);
  const chain = ordered.length ? ordered : reports.slice().sort(compareReportsByDate);
  const first = chain[0];
  const latest = chain[chain.length - 1];
  const portfolioChange = sumBy(chain, "portfolioChange");
  const coupons = sumBy(chain, "couponsAndDividends");
  const commissions = sumBy(chain, "commissionsAndTaxes");
  const deposits = sumBy(chain, "depositsAndWithdrawals");
  const pnl = chain.reduce((sum, report) => sum + Number(report.metrics?.pnl || 0), 0);
  const startValue = Number(first?.metrics?.startValue || 0);
  const endValue = Number(latest?.metrics?.endValue || latest?.portfolioValue || 0);
  const netCashFlow = chain.reduce((sum, report) => sum + Number(report.metrics?.netCashFlow || 0), 0);
  const weightedCashFlow = chain.reduce((sum, report) => sum + Number(report.metrics?.weightedCashFlow || 0), 0);
  const roi = startValue === 0 ? 0 : pnl / startValue * 100;
  const mwr = startValue + weightedCashFlow === 0 ? 0 : pnl / (startValue + weightedCashFlow) * 100;
  const periodReturns = chain.map((report) => ({
    label: formatReportDateRange(report),
    value: Number(report.metrics?.startValue || 0) === 0 ? 0 : Number(report.metrics?.pnl || 0) / Number(report.metrics.startValue) * 100,
  }));
  const twr = (periodReturns.reduce((acc, point) => acc * (1 + point.value / 100), 1) - 1) * 100;
  const topAssets = (latest?.assets || []).slice().sort((left, right) => Math.abs(Number(right.value || 0)) - Math.abs(Number(left.value || 0))).slice(0, 12);
  const totalAssets = Math.max(1, topAssets.reduce((sum, row) => sum + Math.abs(Number(row.value || 0)), 0));

  return {
    portfolioValue: endValue,
    portfolioChange,
    couponsAndDividends: coupons,
    commissionsAndTaxes: commissions,
    depositsAndWithdrawals: deposits,
    assetChange: portfolioChange - coupons - commissions - deposits,
    metrics: {
      pnl: round2(pnl),
      roi: round2(roi),
      mwr: round2(mwr),
      startValue: round2(startValue),
      endValue: round2(endValue),
      netCashFlow: round2(netCashFlow),
      weightedCashFlow: round2(weightedCashFlow),
    },
    advancedMetrics: {
      ...buildEmptySummary().advancedMetrics,
      twr: round2(twr),
      maxDrawdown: Math.min(0, ...periodReturns.map((point) => Math.min(0, point.value))),
      volatility: round2(standardDeviationJs(periodReturns.map((point) => point.value))),
      feeToPnl: safePercent(Math.abs(commissions), Math.abs(pnl)),
      feeToPortfolio: safePercent(Math.abs(commissions), endValue),
      incomeYield: safePercent(coupons, startValue),
      incomeShareOfReturn: safePercent(coupons, Math.abs(pnl)),
      top1Concentration: safePercent(topAssets.slice(0, 1).reduce((sum, row) => sum + Math.abs(Number(row.value || 0)), 0), totalAssets),
      top3Concentration: safePercent(topAssets.slice(0, 3).reduce((sum, row) => sum + Math.abs(Number(row.value || 0)), 0), totalAssets),
      top5Concentration: safePercent(topAssets.slice(0, 5).reduce((sum, row) => sum + Math.abs(Number(row.value || 0)), 0), totalAssets),
      returnSeries: periodReturns.map((point) => ({ ...point, value: round2(point.value) })),
      drawdownSeries: buildDrawdownSeriesJs(periodReturns),
      riskSeries: [
        { label: "Volatility", value: round2(standardDeviationJs(periodReturns.map((point) => point.value))) },
        { label: "Max DD", value: Math.min(0, ...periodReturns.map((point) => Math.min(0, point.value))) },
      ],
      notes: [{ metric: "Filters", text: "Итоги пересчитаны клиентским фильтром по загруженным отчетам." }],
    },
    timeline: chain.map((report) => ({ label: formatReportDateRange(report), value: Number(report.portfolioChange || 0) })),
    breakdown: [
      { label: "Изменение активов", value: portfolioChange - coupons - commissions - deposits },
      { label: "Купоны и дивиденды", value: coupons },
      { label: "Комиссии и налоги", value: commissions },
      { label: "Пополнения и выводы", value: deposits },
    ],
    topAssets,
    trades: chain.flatMap((report) => report.trades || []).slice(0, 40),
    incomeRows: chain.flatMap((report) => report.incomeRows || []).slice(0, 40),
    expectedIncomeRows: chain.flatMap((report) => report.expectedIncomeRows || []).slice(0, 40),
    commissionRows: chain.flatMap((report) => report.commissionRows || []).slice(0, 40),
  };
}

function applyFilteredReportAggregates(sourceReport, filteredReport, dateCoverage) {
  const sourceAssetBase = assetRowsBase(sourceReport.assets);
  const filteredAssetBase = assetRowsBase(filteredReport.assets);
  const dimensionRatio = sourceAssetBase === 0 ? 1 : filteredAssetBase / sourceAssetBase;
  const flowRatio = dimensionRatio * dateCoverage.ratio;
  const portfolioValue = round2(filteredAssetBase);
  const startValue = round2(Number(sourceReport.metrics?.startValue || 0) * dimensionRatio);
  const endValue = portfolioValue || round2(Number(sourceReport.metrics?.endValue || 0) * dimensionRatio);
  const pnl = round2(Number(sourceReport.metrics?.pnl || 0) * flowRatio);
  const portfolioChange = round2(Number(sourceReport.portfolioChange || 0) * flowRatio);
  const deposits = round2(Number(sourceReport.depositsAndWithdrawals || 0) * flowRatio);
  const netCashFlow = round2(Number(sourceReport.metrics?.netCashFlow || 0) * flowRatio);
  const weightedCashFlow = round2(Number(sourceReport.metrics?.weightedCashFlow || 0) * flowRatio);
  const coupons = filteredMoneyRowsTotal(sourceReport.incomeRows, filteredReport.incomeRows, sourceReport.couponsAndDividends, flowRatio, 1);
  const commissions = filteredMoneyRowsTotal(sourceReport.commissionRows, filteredReport.commissionRows, sourceReport.commissionsAndTaxes, flowRatio, -1);
  const assetChange = round2(portfolioChange - coupons - commissions - deposits);
  const roi = startValue === 0 ? 0 : pnl / startValue * 100;
  const mwrBase = startValue + weightedCashFlow;
  const mwr = mwrBase === 0 ? 0 : pnl / mwrBase * 100;
  const partialDateStatus = dateCoverage.ratio < 0.999
    ? `Файл пересчитан под выбранный период ${shortDate(dateCoverage.start)} - ${shortDate(dateCoverage.end)}. Суммы без точных дат распределены пропорционально дням периода.`
    : filteredReport.periodStatus;

  return {
    ...filteredReport,
    period: dateCoverage.ratio < 0.999 ? `Фильтр: ${shortDate(dateCoverage.start)} - ${shortDate(dateCoverage.end)}` : filteredReport.period,
    periodStart: dateCoverage.start || filteredReport.periodStart,
    periodEnd: dateCoverage.end || filteredReport.periodEnd,
    periodDays: dateCoverage.days || filteredReport.periodDays,
    periodStatus: partialDateStatus,
    portfolioValue,
    portfolioChange,
    couponsAndDividends: coupons,
    commissionsAndTaxes: commissions,
    depositsAndWithdrawals: deposits,
    assetChange,
    metrics: {
      ...filteredReport.metrics,
      pnl,
      roi: round2(roi),
      mwr: round2(mwr),
      startValue,
      endValue,
      netCashFlow,
      weightedCashFlow,
    },
    breakdown: [
      { label: "Изменение активов", value: assetChange },
      { label: "Купоны и дивиденды", value: coupons },
      { label: "Комиссии и налоги", value: commissions },
      { label: "Пополнения и выводы", value: deposits },
    ],
  };
}

function hasDimensionFilters(filters) {
  const selectedClasses = filters?.assetClasses || [];
  const selectedIndustries = filters?.industries || [];
  const allClassesSelected = selectedClasses.length === ASSET_CLASS_OPTIONS.length
    && ASSET_CLASS_OPTIONS.every(([id]) => selectedClasses.includes(id));
  return !allClassesSelected || selectedIndustries.length > 0;
}

function getReportDateCoverage(report, filters) {
  const reportStart = report.periodStart || report.periodEnd || "";
  const reportEnd = report.periodEnd || report.periodStart || "";
  if (!reportStart || !reportEnd) {
    return { ratio: 1, start: reportStart, end: reportEnd, days: Number(report.periodDays || 0) };
  }

  const start = maxIsoDate(reportStart, filters.dateFrom || reportStart);
  const end = minIsoDate(reportEnd, filters.dateTo || reportEnd);
  const totalDays = inclusiveIsoDays(reportStart, reportEnd) || Number(report.periodDays || 0) || 1;
  const overlapDays = Math.max(0, inclusiveIsoDays(start, end));
  const ratio = overlapDays === 0 ? 0 : Math.min(1, overlapDays / totalDays);
  return { ratio, start, end, days: overlapDays };
}

function maxIsoDate(left, right) {
  if (!left) return right || "";
  if (!right) return left || "";
  return left >= right ? left : right;
}

function minIsoDate(left, right) {
  if (!left) return right || "";
  if (!right) return left || "";
  return left <= right ? left : right;
}

function inclusiveIsoDays(start, end) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate || endDate < startDate) return 0;
  return Math.floor((endDate - startDate) / 86400000) + 1;
}

function assetRowsBase(rows) {
  return (rows || []).reduce((sum, row) => sum + Math.abs(Number(row.value || 0)), 0);
}

function filteredMoneyRowsTotal(sourceRows, filteredRows, sourceTotal, ratio, sign) {
  if ((sourceRows || []).length === 0) {
    return round2(Number(sourceTotal || 0) * ratio);
  }

  const total = (filteredRows || []).reduce((sum, row) => sum + Math.abs(Number(row.value || 0)), 0);
  return round2(total * sign);
}

function sumBy(items, key) {
  return items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function safePercent(numerator, denominator) {
  return Number(denominator || 0) === 0 ? 0 : round2(Number(numerator || 0) / Number(denominator) * 100);
}

function standardDeviationJs(values) {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildDrawdownSeriesJs(periodReturns) {
  let cumulative = 1;
  let peak = 1;
  return periodReturns.map((point) => {
    cumulative *= 1 + Number(point.value || 0) / 100;
    peak = Math.max(peak, cumulative);
    return {
      label: point.label,
      value: round2(peak === 0 ? 0 : (cumulative - peak) / peak * 100),
    };
  });
}

function FormulaModal({ formulaKey, close }) {
  const item = FORMULAS[formulaKey] || {
    title: ADVANCED_LABELS[formulaKey] || "Метрика",
    formula: "Формула будет добавлена после уточнения источников данных.",
    text: "Метрика рассчитана на основе загруженных отчетов.",
  };
  return h("div", { className: "modalOverlay", onClick: close },
    h("div", { className: "formulaModal", onClick: (event) => event.stopPropagation() },
      h("div", { className: "modalHeader" },
        h("div", null,
          h("p", { className: "eyebrow" }, "formula"),
          h("h2", null, item.title)
        ),
        h("button", { className: "modalClose", onClick: close, title: "Закрыть" }, "×")
      ),
      h("code", null, item.formula),
      h("p", null, item.text)
    )
  );
}

function InfoButton({ metric, openFormula }) {
  if (!metric || !openFormula) return null;
  return h("button", {
    className: "infoButton",
    onClick: (event) => {
      event.stopPropagation();
      openFormula(metric);
    },
    title: "Как считается",
  }, "i");
}

function VersionFrame({ title, go, children }) {
  return h("section", { className: "versionFrame" },
    h("div", { className: "versionHeader" },
      h("button", { className: "backButton", onClick: () => go("home") }, "←"),
      h("div", null,
        h("p", { className: "eyebrow" }, "design mode"),
        h("h1", null, title)
      )
    ),
    children
  );
}

function EmptyState({ error, loading, upload }) {
  return h("div", { className: "empty" },
    h("div", { className: "uploadDrop" },
      h("div", { className: "uploadIcon" }, "↑"),
      h("h2", null, loading ? "Файл загружается" : "Загрузите Excel-отчеты"),
      h("p", null, "Можно выбрать дневной и месячный .xls одновременно. После загрузки появятся графики, состав портфеля и детализация операций."),
      h(UploadButton, { loading, upload, compact: true }),
      error && h("p", { className: "error" }, error)
    )
  );
}

function ReportFiltersBar({ data, filters, setFilters }) {
  const reports = getIncludedReports(data).sort(compareReportsByDate);
  const bounds = getReportDateBounds(reports);
  const effectiveFilters = normalizeReportFilters(filters, bounds);
  const industries = getIndustryOptions(data.reports);

  function patch(next) {
    setFilters({ ...effectiveFilters, ...next });
  }

  function choosePreset(preset, months) {
    if (months === "all") {
      patch({ preset, dateFrom: bounds.start, dateTo: bounds.end });
      return;
    }

    if (months === "ytd") {
      const year = (bounds.end || new Date().toISOString()).slice(0, 4);
      patch({ preset, dateFrom: `${year}-01-01`, dateTo: bounds.end });
      return;
    }

    patch({ preset, dateFrom: shiftIsoMonth(bounds.end, -months), dateTo: bounds.end });
  }

  function toggleAssetClass(id) {
    const current = effectiveFilters.assetClasses;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    patch({ assetClasses: next.length ? next : current });
  }

  function toggleIndustry(id) {
    const current = effectiveFilters.industries;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    patch({ industries: next });
  }

  function reset() {
    setFilters({
      ...DEFAULT_REPORT_FILTERS,
      dateFrom: bounds.start,
      dateTo: bounds.end,
    });
  }

  return h("section", { className: "reportFilters", "data-ai-report-filters": "true" },
    h("div", { className: "filterGroup periodPresetGroup" },
      h("span", null, "Период"),
      h("div", null, PERIOD_PRESETS.map(([id, label, months]) => h("button", {
        key: id,
        className: effectiveFilters.preset === id ? "active" : "",
        onClick: () => choosePreset(id, months),
      }, label)))
    ),
    h("label", { className: "filterGroup dateFilter" },
      h("span", null, "С даты"),
      h("input", {
        type: "date",
        value: effectiveFilters.dateFrom,
        min: bounds.start,
        max: effectiveFilters.dateTo || bounds.end,
        onChange: (event) => patch({ preset: "custom", dateFrom: event.target.value }),
      })
    ),
    h("label", { className: "filterGroup dateFilter" },
      h("span", null, "По дату"),
      h("input", {
        type: "date",
        value: effectiveFilters.dateTo,
        min: effectiveFilters.dateFrom || bounds.start,
        max: bounds.end,
        onChange: (event) => patch({ preset: "custom", dateTo: event.target.value }),
      })
    ),
    h("div", { className: "filterGroup assetClassFilter" },
      h("span", null, "Классы активов"),
      h("div", null, ASSET_CLASS_OPTIONS.map(([id, label]) => h("label", { key: id },
        h("input", {
          type: "checkbox",
          checked: effectiveFilters.assetClasses.includes(id),
          onChange: () => toggleAssetClass(id),
        }),
        label
      )))
    ),
    h("div", { className: "filterGroup industryFilter" },
      h("span", null, "Отрасли (мультивыбор)"),
      h("details", null,
        h("summary", null, effectiveFilters.industries.length ? `${effectiveFilters.industries.length} выбран(о)` : "Все отрасли"),
        h("div", null,
          industries.map((industry) => h("label", { key: industry },
            h("input", {
              type: "checkbox",
              checked: effectiveFilters.industries.includes(industry),
              onChange: () => toggleIndustry(industry),
            }),
            industry
          ))
        )
      )
    ),
    h("button", { className: "filterReset", onClick: reset }, "Сбросить")
  );
}

function DashboardV1({ data, sourceData, report, activeReport, setActiveReport, openFormula, reportFilters, setReportFilters }) {
  const summary = data.summary;
  const effectiveFilters = normalizeReportFilters(reportFilters, getReportDateBounds(getIncludedReports(sourceData)));
  const filteredReport = filterReportDetails(report, effectiveFilters);
  const includedReports = getIncludedReports(data);
  return h("div", { className: "dashboard v1Dashboard" },
    h(ReportFiltersBar, { data: sourceData, filters: reportFilters, setFilters: setReportFilters }),
    h(ReportTabs, { reports: data.reports, activeReport, setActiveReport }),
    h(AgentBrief, { data, report }),
    h("section", { className: "analysisCard" },
      h("div", { className: "cardHeader" },
        h("div", null,
          h("h2", null, "Как менялся портфель"),
          h("p", null, report?.fileName)
        ),
        h("button", { className: "ghostButton" }, "Весь портфель")
      ),
      h("div", { className: "changeGrid" },
        h("div", { className: "bigNumber" },
          h("strong", { className: classForValue(report.portfolioChange) }, signedRub(report.portfolioChange)),
          h("span", null, report.period)
        ),
        h(BreakdownList, { points: report.breakdown })
      )
    ),
    h("section", { className: "grid four" },
      h(Kpi, { title: "PnL", value: report.metrics.pnl, metric: "pnl", openFormula }),
      h(KpiPercent, { title: "ROI", value: report.metrics.roi, metric: "roi", openFormula }),
      h(KpiPercent, { title: "MWR", value: report.metrics.mwr, metric: "mwr", openFormula }),
      h(Kpi, { title: "Стоимость", value: report.metrics.endValue, neutral: true })
    ),
    h(ReturnEqualityNote, {
      roi: report.metrics.roi,
      mwr: report.metrics.mwr,
      twr: activeReport === -1 ? summary.advancedMetrics.twr : null,
      netCashFlow: report.metrics.netCashFlow,
    }),
    h(ContributionLeaders, { report: filteredReport }),
    h("section", { className: "grid two" },
      h(PanelChart, { title: "Динамика по датам отчетов", meta: `${includedReports.length} период(а) в итогах`, points: buildReportMetricSeries(includedReports, "pnl") }),
      h(PanelChart, { title: "Из чего складывается результат", meta: signedRub(summary.portfolioChange), points: summary.breakdown })
    ),
    h("section", { className: "grid four" },
      h(Kpi, { title: "Активы", value: summary.assetChange }),
      h(Kpi, { title: "Купоны и дивиденды", value: summary.couponsAndDividends }),
      h(Kpi, { title: "Комиссии и налоги", value: summary.commissionsAndTaxes }),
      h(Kpi, { title: "Пополнения и выводы", value: summary.depositsAndWithdrawals })
    ),
    h("section", { className: "grid two" },
      h(DetailTable, { title: "Крупные позиции", rows: filteredReport.assets, empty: "Позиции не найдены" }),
      h(DetailTable, { title: "Сделки", rows: filteredReport.trades, empty: "Сделки не найдены" })
    ),
    h("section", { className: "grid two" },
      h(DetailTable, { title: "Купоны и дивиденды", rows: filteredReport.incomeRows, empty: "Доходы не найдены" }),
      h(DetailTable, { title: "Ожидаемый доход", rows: filteredReport.expectedIncomeRows || [], empty: "Ожидаемый доход не найден" })
    ),
    h("section", { className: "grid two" },
      h(DetailTable, { title: "Комиссии и налоги", rows: filteredReport.commissionRows, empty: "Комиссии не найдены" }),
      h(DetailTable, { title: "Все денежные операции", rows: [...filteredReport.incomeRows, ...(filteredReport.expectedIncomeRows || []), ...filteredReport.commissionRows], empty: "Операции не найдены" })
    )
  );
}

function DashboardV2({ data, sourceData, report, activeReport, setActiveReport, openFormula, reportFilters, setReportFilters }) {
  const summary = data.summary;
  const activeMetrics = report.metrics;
  const effectiveFilters = normalizeReportFilters(reportFilters, getReportDateBounds(getIncludedReports(sourceData)));
  const filteredReport = filterReportDetails(report, effectiveFilters);
  const includedReports = getIncludedReports(data);
  return h("div", { className: "dashboard v2Dashboard" },
    h(ReportFiltersBar, { data: sourceData, filters: reportFilters, setFilters: setReportFilters }),
    h(ReportTabs, { reports: data.reports, activeReport, setActiveReport }),
    h(AgentBrief, { data, report }),
    h("section", { className: "cockpitHero" },
      h("div", { className: "cockpitMain" },
        h("p", { className: "eyebrow" }, report.period),
        h("h2", null, "Инвесторский результат периода"),
        h("strong", { className: `heroPnl ${classForValue(activeMetrics.pnl)}` }, signedRub(activeMetrics.pnl)),
        h("div", { className: "heroStats" },
          h(MetricChip, { label: "ROI", value: formatPercent(activeMetrics.roi), tone: activeMetrics.roi, metric: "roi", openFormula }),
          h(MetricChip, { label: "MWR", value: formatPercent(activeMetrics.mwr), tone: activeMetrics.mwr, metric: "mwr", openFormula }),
          h(MetricChip, { label: "Портфель", value: formatRub(activeMetrics.endValue), tone: 0 })
        )
      ),
      h("div", { className: "pulsePanel" },
        h("span", null, "Performance pulse"),
        h(RadialMetric, { value: activeMetrics.roi }),
        h("p", null, "ROI показывает доходность к начальной стоимости. MWR приближает денежно-взвешенную доходность с учетом потоков.")
      )
    ),
    h("section", { className: "metricRunway" },
      h(ModernMetricCard, { label: "PnL", value: signedRub(activeMetrics.pnl), sub: "финансовый результат", tone: activeMetrics.pnl, metric: "pnl", openFormula }),
      h(ModernMetricCard, { label: "ROI", value: formatPercent(activeMetrics.roi), sub: "доходность периода", tone: activeMetrics.roi, metric: "roi", openFormula }),
      h(ModernMetricCard, { label: "MWR", value: formatPercent(activeMetrics.mwr), sub: "money-weighted return", tone: activeMetrics.mwr, metric: "mwr", openFormula }),
      h(ModernMetricCard, { label: "Net flow", value: signedRub(activeMetrics.netCashFlow), sub: "пополнения и выводы", tone: activeMetrics.netCashFlow })
    ),
    h(ReturnEqualityNote, {
      roi: activeMetrics.roi,
      mwr: activeMetrics.mwr,
      twr: activeReport === -1 ? summary.advancedMetrics.twr : null,
      netCashFlow: activeMetrics.netCashFlow,
    }),
    h(ContributionLeaders, { report: filteredReport }),
    h("section", { className: "v2Grid singleGrid" },
      h(InvestorIndicators, { report, summary })
    ),
    h("section", { className: "v2Grid" },
      h("div", { className: "glassPanel wide" },
        h("div", { className: "panelTitle" },
          h("h3", null, "Momentum"),
          h("span", null, "по загруженным отчетам")
        ),
        h(LineChart, { points: buildReportMetricSeries(includedReports, "pnl") })
      ),
      h("div", { className: "glassPanel" },
        h("div", { className: "panelTitle" },
          h("h3", null, "Композиция PnL"),
          h("span", { className: classForValue(summary.portfolioChange) }, signedRub(summary.portfolioChange))
        ),
        h(StackedBreakdown, { points: report.breakdown })
      )
    ),
    h("section", { className: "v2Grid" },
      h(DetailTable, { title: "Позиции", rows: filteredReport.assets, empty: "Позиции не найдены", modern: true }),
      h(DetailTable, { title: "Операции и доходы", rows: [...filteredReport.trades, ...filteredReport.incomeRows, ...(filteredReport.expectedIncomeRows || []), ...filteredReport.commissionRows], empty: "Операции не найдены", modern: true })
    )
  );
}

function DashboardV3({ data, sourceData, report, activeReport, setActiveReport, openFormula, reportFilters, setReportFilters }) {
  const [selected, setSelected] = useState(["performance", "risk", "costs"]);
  const [activePerformanceMetric, setActivePerformanceMetric] = useState("twr");
  const advanced = data.summary.advancedMetrics;
  const includedReports = getIncludedReports(data);
  const selectedCategories = ADVANCED_CATEGORIES.filter((category) => selected.includes(category.id));

  function toggleCategory(id) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  }

  return h("div", { className: "dashboard v3Dashboard" },
    h(ReportFiltersBar, { data: sourceData, filters: reportFilters, setFilters: setReportFilters }),
    h(ReportTabs, { reports: data.reports, activeReport, setActiveReport }),
    h(AgentBrief, { data, report }),
    h("section", { className: "labHero" },
      h("div", null,
        h("p", { className: "eyebrow" }, "stateful analytics"),
        h("h2", null, "V3 связывает фильтры, категории и графики"),
        h("p", null, "Выберите категории ниже: карточки и графики перестроятся от текущего состояния страницы. Итоговая серия исключает пересекающиеся периоды, чтобы не задваивать результат.")
      ),
      h("div", { className: "labHeroMetrics" },
        h(MetricChip, { label: "TWR", value: formatPercent(advanced.twr), tone: advanced.twr, metric: "twr", openFormula }),
        h(MetricChip, { label: "Max DD", value: formatPercent(advanced.maxDrawdown), tone: advanced.maxDrawdown, metric: "maxDrawdown", openFormula }),
        h(MetricChip, { label: "Volatility", value: formatPercent(advanced.volatility), tone: -advanced.volatility, metric: "volatility", openFormula }),
        h(MetricChip, { label: "Turnover", value: formatPercent(advanced.turnover), tone: 0, metric: "turnover", openFormula })
      )
    ),
    h(CategoryFilters, { selected, toggleCategory }),
    h(PeriodChain, { reports: data.reports }),
    h(ContributionLeaders, { report }),
    h(CategoryGroups, {
      data,
      report,
      selectedCategories,
      includedReports,
      openFormula,
      activePerformanceMetric,
      setActivePerformanceMetric,
    }),
    h("section", { className: "v3Notes singleGrid" },
      h("div", { className: "glassPanel" },
        h("div", { className: "panelTitle" },
          h("h3", null, "Ограничения расчета"),
          h("span", null, `${advanced.notes.length}`)
        ),
        h("div", { className: "noteList" },
          advanced.notes.map((note) => h("div", { key: note.metric },
            h("strong", null, note.metric),
            h("span", null, note.text)
          ))
        )
      )
    )
  );
}

function ContributionLeaders({ report }) {
  const leaders = buildContributionLeaders(report);
  return h("section", { className: "contributionLeaders" },
    h("div", { className: "panelTitle" },
      h("div", null,
        h("h3", null, "Топ вкладов в результат"),
        h("span", null, "Лучшие и худшие инструменты по доступным строкам отчета")
      ),
      h("span", null, `${leaders.best.length + leaders.worst.length}`)
    ),
    h("div", { className: "leaderColumns" },
      h(LeaderColumn, { title: "Лучшие", rows: leaders.best, tone: "positive" }),
      h(LeaderColumn, { title: "Худшие", rows: leaders.worst, tone: "negative" })
    )
  );
}

function LeaderColumn({ title, rows, tone }) {
  return h("div", { className: `leaderColumn ${tone}` },
    h("strong", null, title),
    rows.length
      ? rows.map((row, index) => h("div", { className: "leaderRow", key: `${title}-${row.title}-${index}` },
          h("em", null, `${index + 1}.`),
          h("span", null,
            h("b", null, row.title),
            h("small", null, row.reason)
          ),
          h("strong", { className: classForValue(row.value) }, signedRub(row.value))
        ))
      : h("p", null, "Нет данных")
  );
}

function CategoryFilters({ selected, toggleCategory }) {
  return h("section", { className: "categoryFilters" },
    ADVANCED_CATEGORIES.map((category) => {
      const active = selected.includes(category.id);
      return h("button", {
        key: category.id,
        className: active ? "active" : "",
        onClick: () => toggleCategory(category.id),
      },
        h("strong", null, category.title),
        h("span", null, category.text)
      );
    })
  );
}

function AdvancedMetricCard({ metric, value, category, openFormula }) {
  const label = ADVANCED_LABELS[metric] || metric;
  return h("div", {
    className: `advancedMetricCard ${classForValue(value)}`,
    "data-ai-metric": metric,
    "data-ai-value": String(value ?? ""),
    "data-ai-category": category,
  },
    h(InfoButton, { metric, openFormula }),
    h("span", null, label),
    h("strong", null, formatAdvancedValue(metric, value)),
    h("small", null, category)
  );
}

function CategoryGroups({
  data,
  report,
  selectedCategories,
  includedReports,
  openFormula,
  activePerformanceMetric,
  setActivePerformanceMetric,
}) {
  return h("section", { className: "categoryGroups" },
    selectedCategories.map((category) => h("div", { className: "categoryGroup glassPanel", key: category.id },
      h("div", { className: "panelTitle" },
        h("div", null,
          h("h3", null, category.title),
          h("span", null, category.text)
        ),
        h("span", null, `${category.metrics.length} метрик`)
      ),
      category.id === "performance"
        ? h(PerformanceMetricBlock, {
            data,
            report,
            category,
            activeMetric: activePerformanceMetric,
            setActiveMetric: setActivePerformanceMetric,
            openFormula,
          })
        : h("div", { className: "categoryMetricGrid" },
            category.metrics.map((metric) => h(AdvancedMetricCard, {
              key: `${category.id}-${metric}`,
              metric,
              value: readAdvancedMetric(data, report, metric),
              category: category.title,
              openFormula,
            }))
          ),
      h("div", { className: "categoryChart" },
        h(V3CategoryChart, { category, data, report, includedReports, activePerformanceMetric })
      )
    ))
  );
}

function PerformanceMetricBlock({ data, report, category, activeMetric, setActiveMetric, openFormula }) {
  return h("div", { className: "performanceMetricBlock" },
    h("div", { className: "performanceMetricHeader" },
      h("strong", null, category.title),
      h("span", null, "клик по значению меняет график")
    ),
    h("div", { className: "performanceMetricGrid" },
      category.metrics.map((metric) => {
        const value = readAdvancedMetric(data, report, metric);
        const active = metric === activeMetric;
        return h("div", {
          key: metric,
          className: `performanceMetricValue ${active ? "active" : ""} ${classForValue(value)}`,
          "data-ai-metric": metric,
          "data-ai-value": String(value ?? ""),
          "data-ai-category": category.title,
          role: "button",
          tabIndex: 0,
          onClick: () => setActiveMetric(metric),
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setActiveMetric(metric);
            }
          },
        },
          h(InfoButton, { metric, openFormula }),
          h("span", null, ADVANCED_LABELS[metric] || metric),
          h("strong", null, formatAdvancedValue(metric, value)),
          h("small", null, active ? "на графике" : "показать по датам")
        );
      })
    ),
    h(ReturnEqualityNote, {
      roi: readAdvancedMetric(data, report, "roi"),
      mwr: readAdvancedMetric(data, report, "mwr"),
      twr: readAdvancedMetric(data, report, "twr"),
      netCashFlow: report.metrics.netCashFlow,
    })
  );
}

function PeriodChain({ reports }) {
  return h("section", { className: "periodChain" },
    h("div", { className: "panelTitle" },
      h("h3", null, "Цепочка периодов"),
      h("span", null, "с учетом пересечений")
    ),
    h("div", { className: "periodChainItems" },
      reports.map((report) => h("div", { className: `periodChainItem ${report.includedInSummary ? "included" : "excluded"}`, key: report.fileName },
        h("strong", null, report.period),
        h("span", null, `${report.periodStart || "?"} → ${report.periodEnd || "?"}`),
        h("small", null, report.periodStatus)
      ))
    )
  );
}

function V3CategoryChart({ category, data, report, includedReports, activePerformanceMetric }) {
  const advanced = data.summary.advancedMetrics;
  if (category.id === "performance") {
    const metric = activePerformanceMetric || "twr";
    return h("div", null,
      h(ChartPeriodStamp, { report, reports: includedReports }),
      h("div", { className: "selectedChartMetric" },
        h("span", null, "На графике"),
        h("strong", null, ADVANCED_LABELS[metric] || metric)
      ),
      h(LineChart, {
        points: buildPerformanceMetricSeries(data, includedReports, metric),
        valueFormatter: MONEY_METRICS.has(metric) ? signedRub : formatPercent,
      })
    );
  }
  if (category.id === "risk") {
    return h("div", { className: "dualChart" },
      h(ChartPeriodStamp, { report, reports: includedReports }),
      h(LineChart, {
        points: advanced.drawdownSeries.length
          ? attachDateLabels(advanced.drawdownSeries, includedReports)
          : buildReportMetricSeries(includedReports, "roi").map((point) => ({ ...point, value: Math.min(0, point.value) })),
        valueFormatter: formatPercent,
      }),
      h(CompactBars, { points: advanced.riskSeries })
    );
  }
  if (category.id === "concentration") {
    return h("div", null,
      h(ChartPeriodStamp, { report, reports: includedReports }),
      h(CompactBars, { points: [
        { label: "Top-1", value: advanced.top1Concentration },
        { label: "Top-3", value: advanced.top3Concentration },
        { label: "Top-5", value: advanced.top5Concentration },
      ] })
    );
  }
  if (category.id === "currency") {
    return h("div", null,
      h(ChartPeriodStamp, { report, reports: includedReports }),
      h(CompactBars, { points: advanced.exposureSeries }),
      h("div", { className: "fxImpact" }, h("span", null, "FX impact"), h("strong", { className: classForValue(advanced.fxImpact) }, signedRub(advanced.fxImpact)))
    );
  }
  if (category.id === "pnl") {
    return h("div", null,
      h(ChartPeriodStamp, { report, reports: includedReports }),
      h(CompactBars, { money: true, points: [
        { label: "Realized", value: advanced.realizedPnl },
        { label: "Unrealized", value: advanced.unrealizedPnl },
        { label: "Total", value: report.metrics.pnl },
      ] })
    );
  }
  if (category.id === "income") {
    return h("div", null,
      h(ChartPeriodStamp, { report, reports: includedReports }),
      h(CompactBars, { points: [
        { label: "Income yield", value: advanced.incomeYield },
        { label: "Income share", value: advanced.incomeShareOfReturn },
      ] })
    );
  }
  return h("div", null,
    h(ChartPeriodStamp, { report, reports: includedReports }),
    h(CompactBars, { points: [
      { label: "Fee / PnL", value: advanced.feeToPnl },
      { label: "Fee / Portfolio", value: advanced.feeToPortfolio },
      { label: "Turnover", value: advanced.turnover },
    ] })
  );
}

function ChartPeriodStamp({ report, reports }) {
  const chain = reports.length > 1
    ? `${formatReportDateRange(reports[0])} → ${formatReportDateRange(reports[reports.length - 1])}`
    : formatReportDateRange(report);
  return h("div", { className: "chartPeriodStamp" },
    h("span", null, "Даты на графике"),
    h("strong", null, chain)
  );
}

function compareReportsByDate(left, right) {
  return String(left.periodEnd || left.periodStart || "").localeCompare(String(right.periodEnd || right.periodStart || ""))
    || String(left.fileName || "").localeCompare(String(right.fileName || ""));
}

function normalizeReportFilters(filters, bounds) {
  return {
    ...DEFAULT_REPORT_FILTERS,
    ...filters,
    dateFrom: filters?.dateFrom || bounds.start || "",
    dateTo: filters?.dateTo || bounds.end || "",
    assetClasses: filters?.assetClasses?.length ? filters.assetClasses : DEFAULT_REPORT_FILTERS.assetClasses,
    industries: filters?.industries || [],
  };
}

function getFilteredReports(reports, filters) {
  return reports
    .filter((report) => {
      const start = report.periodStart || report.periodEnd;
      const end = report.periodEnd || report.periodStart;
      return (!filters.dateFrom || end >= filters.dateFrom) && (!filters.dateTo || start <= filters.dateTo);
    })
    .sort(compareReportsByDate);
}

function filterReportDetails(report, filters) {
  return {
    ...report,
    assets: (report.assets || []).filter((row) => rowMatchesReportFilters(row, filters)),
    trades: (report.trades || []).filter((row) => rowMatchesReportFilters(row, filters)),
    incomeRows: (report.incomeRows || []).filter((row) => rowMatchesReportFilters(row, filters)),
    expectedIncomeRows: (report.expectedIncomeRows || []).filter((row) => rowMatchesReportFilters(row, filters)),
    commissionRows: (report.commissionRows || []).filter((row) => rowMatchesReportFilters(row, filters)),
  };
}

function rowMatchesReportFilters(row, filters) {
  const assetClass = classifyDetailRow(row);
  const classMatches = !filters.assetClasses?.length || filters.assetClasses.includes(assetClass);
  const industry = extractIndustry(row);
  const industryMatches = !filters.industries?.length || filters.industries.includes(industry);
  const dateMatches = rowMatchesDateRange(row, filters);
  return classMatches && industryMatches && dateMatches;
}

function rowMatchesDateRange(row, filters) {
  const dates = extractRowIsoDates(row);
  if (!dates.length) {
    return true;
  }

  return dates.some((date) => (!filters.dateFrom || date >= filters.dateFrom) && (!filters.dateTo || date <= filters.dateTo));
}

function extractRowIsoDates(row) {
  const text = rowSearchText(row);
  return Array.from(text.matchAll(/\b(\d{2})\.(\d{2})\.(\d{2,4})\b/g))
    .map((match) => {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return `${year}-${match[2]}-${match[1]}`;
    })
    .filter(Boolean);
}

function classifyDetailRow(row) {
  const text = rowSearchText(row);
  if (/денеж|валют|рубл|rub|usd|eur|cash|остаток/i.test(text)) return "cash";
  if (/пиф|бпиф|etf|фонд|fund/i.test(text)) return "funds";
  if (/облигац|офз|bond|купон/i.test(text)) return "bonds";
  return "stocks";
}

function extractIndustry(row) {
  const entries = Object.entries(row.columns || {});
  const explicit = entries.find(([key]) => /отрасл|сектор|industry|sector/i.test(key));
  if (explicit?.[1]) {
    return explicit[1];
  }

  const text = rowSearchText(row);
  const rule = INDUSTRY_RULES.find(([, pattern]) => pattern.test(text));
  if (rule) return rule[0];
  if (/пиф|etf|фонд/i.test(text)) return "Фонды";
  if (/облигац|офз|купон/i.test(text)) return "Облигации";
  if (/денеж|рубл|cash|usd|eur/i.test(text)) return "Деньги";
  return "Все прочее";
}

function rowSearchText(row) {
  return [
    row?.title,
    row?.subtitle,
    ...Object.entries(row?.columns || {}).flatMap(([key, value]) => [key, value]),
  ].filter(Boolean).join(" ");
}

function buildContributionLeaders(report) {
  const rows = [
    ...(report.assets || []),
    ...(report.trades || []),
    ...(report.incomeRows || []),
    ...(report.expectedIncomeRows || []),
    ...(report.commissionRows || []),
  ]
    .filter((row) => row?.title && Number.isFinite(Number(row.value)))
    .map((row) => ({
      title: row.title,
      value: Number(row.value || 0),
      reason: buildContributionReason(row),
    }));

  const best = rows
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 3);

  const negativeWorst = rows
    .filter((row) => row.value < 0)
    .sort((left, right) => left.value - right.value)
    .slice(0, 3);

  const worst = negativeWorst.length
    ? negativeWorst
    : rows
        .filter((row) => row.value >= 0)
        .sort((left, right) => left.value - right.value)
        .slice(0, 3)
        .map((row) => ({ ...row, reason: `${row.reason}; минимальный положительный вклад` }));

  return { best, worst };
}

function buildContributionReason(row) {
  const assetClass = {
    cash: "денежные средства",
    stocks: "акция",
    funds: "фонд",
    bonds: "облигация / купон",
  }[classifyDetailRow(row)] || "инструмент";
  const industry = extractIndustry(row);
  const source = row.subtitle ? ` · ${row.subtitle}` : "";
  return `${assetClass}, ${industry}${source}`;
}

function getIndustryOptions(reports) {
  const industries = new Set();
  reports.forEach((report) => {
    [
      ...(report.assets || []),
      ...(report.trades || []),
      ...(report.incomeRows || []),
      ...(report.expectedIncomeRows || []),
      ...(report.commissionRows || []),
    ].forEach((row) => industries.add(extractIndustry(row)));
  });
  return Array.from(industries).sort((left, right) => left.localeCompare(right));
}

function shiftIsoMonth(isoDate, deltaMonths) {
  const date = parseIsoDate(isoDate) || new Date();
  date.setUTCMonth(date.getUTCMonth() + deltaMonths);
  return date.toISOString().slice(0, 10);
}

function getReportDateBounds(reports) {
  const starts = reports.map((report) => report.periodStart).filter(Boolean).sort();
  const ends = reports.map((report) => report.periodEnd || report.periodStart).filter(Boolean).sort();
  return {
    start: starts[0] || "",
    end: ends[ends.length - 1] || starts[0] || "",
  };
}

function extractAccountLabel(report) {
  const source = String(report.fileName || report.sheetName || "Счет");
  const withoutExtension = source.replace(/\.[^.]+$/, "");
  const withoutDates = withoutExtension
    .replace(/\d{2}[._-]\d{2}[._-]\d{2,4}/g, "")
    .replace(/\d{4}[._-]\d{2}[._-]\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutDates || report.sheetName || "Загруженный счет";
}

function buildAccountOptions(reports) {
  const groups = new Map();
  reports.forEach((report) => {
    const label = extractAccountLabel(report);
    const id = label.toLowerCase();
    const current = groups.get(id) || { id, label, count: 0, files: [] };
    current.count += 1;
    current.files.push(report.fileName);
    groups.set(id, current);
  });
  return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function filterReportsByCustomPeriod(reports, dateFrom, dateTo, accountIds) {
  return reports
    .filter((report) => {
      const accountId = extractAccountLabel(report).toLowerCase();
      const start = report.periodStart || report.periodEnd;
      const end = report.periodEnd || report.periodStart;
      const accountMatches = accountIds.includes(accountId);
      const dateMatches = (!dateFrom || end >= dateFrom) && (!dateTo || start <= dateTo);
      return accountMatches && dateMatches;
    })
    .sort(compareReportsByDate);
}

function parseIsoDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function buildReportMetricSeries(reports, metric) {
  return reports.map((item) => ({
    label: formatReportDateRange(item),
    value: readReportMetric(item, metric),
  }));
}

function buildPerformanceMetricSeries(data, reports, metric) {
  if (metric === "twr" && data.summary.advancedMetrics.returnSeries.length) {
    return attachDateLabels(data.summary.advancedMetrics.returnSeries, reports);
  }
  return buildReportMetricSeries(reports, metric);
}

function attachDateLabels(points, reports) {
  return points.map((point, index) => ({
    ...point,
    label: reports[index] ? formatReportDateRange(reports[index]) : point.label,
  }));
}

function readReportMetric(report, metric) {
  if (metric === "twr") return Number(report.metrics?.roi || 0);
  if (metric === "roi") return Number(report.metrics?.roi || 0);
  if (metric === "mwr") return Number(report.metrics?.mwr || 0);
  if (metric === "pnl") return Number(report.metrics?.pnl || 0);
  if (metric === "portfolioValue") return Number(report.portfolioValue || report.metrics?.endValue || 0);
  return Number(report.metrics?.[metric] || 0);
}

function formatReportDateRange(report) {
  const start = shortDate(report?.periodStart);
  const end = shortDate(report?.periodEnd);
  if (start && end && start !== end) return `${start} - ${end}`;
  return start || end || report?.period || "без даты";
}

function shortDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return String(value);
  return `${day}.${month}.${year.slice(-2)}`;
}

function CompactBars({ points, money = false }) {
  const max = Math.max(1, ...points.map((point) => Math.abs(Number(point.value || 0))));
  return h("div", { className: "compactBars" },
    points.map((point) => {
      const value = Number(point.value || 0);
      return h("div", { className: "compactBar", key: point.label },
        h("div", null,
          h("span", null, point.label),
          h("strong", { className: classForValue(value) }, money ? signedRub(value) : formatPercent(value))
        ),
        h("div", { className: "barTrack" },
          h("div", { className: `barFill ${classForValue(value)}`, style: { width: `${Math.max(5, Math.abs(value) / max * 100)}%` } })
        )
      );
    })
  );
}

function readAdvancedMetric(data, report, metric) {
  if (metric === "roi") return report.metrics.roi;
  if (metric === "mwr") return report.metrics.mwr;
  if (metric === "pnl") return report.metrics.pnl;
  return Number(data.summary.advancedMetrics[metric] || 0);
}

function getIncludedReports(data) {
  const included = data.reports.filter((report) => report.includedInSummary);
  return included.length ? included : data.reports;
}

function formatAdvancedValue(metric, value) {
  if (MONEY_METRICS.has(metric)) return signedRub(value);
  if (RATIO_METRICS.has(metric)) return plain.format(Number(value || 0));
  return formatPercent(value);
}

function InvestorIndicators({ report, summary }) {
  const ideas = [
    ["Доходность до комиссий", signedRub(report.metrics.pnl - report.commissionsAndTaxes), "покажет, сколько съели комиссии и налоги"],
    ["Fee drag", formatPercent(summary.metrics.endValue ? Math.abs(report.commissionsAndTaxes) / summary.metrics.endValue * 100 : 0), "комиссионная нагрузка к портфелю"],
    ["Income yield", formatPercent(report.metrics.startValue ? report.couponsAndDividends / report.metrics.startValue * 100 : 0), "купонная доходность за период"],
    ["Turnover", report.trades.length ? `${report.trades.length} сделк.` : "нет сделок", "активность торговли в периоде"],
    ["Concentration", report.assets.length ? `${report.assets.slice(0, 3).length} топ-поз.` : "нет данных", "доля крупнейших активов после нормализации"],
    ["Cash drag / FX impact", "следующий шаг", "можно считать из валютных строк и курсов отчета"]
  ];

  return h("div", { className: "glassPanel indicatorPanel" },
    h("div", { className: "panelTitle" },
      h("h3", null, "Что еще считать инвестору"),
      h("span", null, "следующие метрики")
    ),
    h("div", { className: "indicatorList" },
      ideas.map(([title, value, text]) => h("div", { className: "indicatorItem", key: title },
        h("span", null, title),
        h("strong", null, value),
        h("small", null, text)
      ))
    )
  );
}

function AgentBrief({ data, report }) {
  const [expanded, setExpanded] = useState(false);
  const prompt = buildAgentPrompt(data, report);
  async function copyPrompt() {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(prompt);
    }
  }

  return h("section", {
    className: `glassPanel agentPanel agentHandoff ${expanded ? "expanded" : "collapsed"}`,
    "data-ai-agent-handoff": "true",
    "data-ai-expanded": String(expanded),
  },
    h("div", { className: "panelTitle agentHandoffHeader" },
      h("div", null,
        h("h3", null, "Отдать ИИ-агенту"),
        h("span", null, expanded ? "Готовый текст для передачи агенту" : "Свернуто, текст можно скопировать сразу")
      ),
      h("div", { className: "agentHandoffActions" },
        h("button", { className: "copyButton", onClick: copyPrompt }, "Скопировать текст для ИИ"),
        h("button", { className: "copyButton", onClick: () => setExpanded(!expanded), "aria-expanded": String(expanded) },
          expanded ? "Свернуть" : "Развернуть"
        )
      )
    ),
    expanded && h("p", null, "Короткий контекст, который можно передать агенту для поиска рисков, объяснения результата или подготовки инвестиционного комментария."),
    expanded && h("pre", null, prompt)
  );
}

function buildAgentPrompt(data, report) {
  const summary = data.summary;
  const topAssets = report.assets.slice(0, 5).map((item) => `${item.title}: ${signedRub(item.value)}`).join("; ");
  const expectedIncome = (report.expectedIncomeRows || []).slice(0, 3).map((item) => `${item.title}: ${signedRub(item.value)}`).join("; ");
  return [
    "Проанализируй брокерский отчет инвестора и дай краткие выводы.",
    `Период: ${report.period}.`,
    `Стоимость портфеля: ${formatRub(summary.portfolioValue)}.`,
    `PnL: ${signedRub(report.metrics.pnl)}, ROI: ${formatPercent(report.metrics.roi)}, MWR: ${formatPercent(report.metrics.mwr)}.`,
    `Состав результата: активы ${signedRub(report.assetChange)}, купоны ${signedRub(report.couponsAndDividends)}, комиссии/налоги ${signedRub(report.commissionsAndTaxes)}, net flow ${signedRub(report.metrics.netCashFlow)}.`,
    expectedIncome ? `Ожидаемый доход, не включенный в PnL: ${expectedIncome}.` : "Ожидаемый доход в отчете не найден.",
    `Крупные позиции: ${topAssets || "нет данных"}.`,
    "Ответь: 1) что повлияло на результат, 2) какие риски видны, 3) какие метрики стоит проверить дальше."
  ].join("\n");
}

function ReportTabs({ reports, activeReport, setActiveReport }) {
  return h("div", { className: "periodTabs" },
    h("button", {
      key: "virtual-period",
      className: activeReport === -1 ? "active virtual" : "virtual",
      onClick: () => setActiveReport(-1),
      title: "Виртуальный период строится из непересекающейся цепочки отчетов",
    },
      h("span", null, "Все периоды"),
      h("small", null, "виртуальный итог")
    ),
    reports.map((item, index) =>
      h("button", {
        key: item.fileName,
        className: `${index === activeReport ? "active" : ""} ${item.includedInSummary ? "included" : "excluded"}`,
        onClick: () => setActiveReport(index),
        title: item.periodStatus,
      },
        h("span", null, item.period || item.fileName),
        h("small", null, item.includedInSummary ? "в итогах" : "пересечение")
      )
    )
  );
}

function BreakdownList({ points }) {
  return h("div", { className: "breakdown" },
    h("h3", null, "Из чего складывается"),
    points.map((point) => h("div", { className: "breakdownRow", key: point.label },
      h("span", null, point.label),
      h("strong", { className: classForValue(point.value) }, signedRub(point.value)),
      h("span", { className: "arrow" }, "›")
    ))
  );
}

function Kpi({ title, value, neutral, metric, openFormula }) {
  return h("div", { className: "kpi", "data-ai-metric": metric || title, "data-ai-value": String(value ?? "") },
    h(InfoButton, { metric, openFormula }),
    h("span", null, title),
    h("strong", { className: neutral ? "" : classForValue(value) }, neutral ? formatRub(value) : signedRub(value))
  );
}

function KpiPercent({ title, value, metric, openFormula }) {
  return h("div", { className: "kpi", "data-ai-metric": metric || title, "data-ai-value": String(value ?? "") },
    h(InfoButton, { metric, openFormula }),
    h("span", null, title),
    h("strong", { className: classForValue(value) }, formatPercent(value))
  );
}

function MetricChip({ label, value, tone, metric, openFormula }) {
  return h("span", { className: `metricChip ${classForValue(tone)}`, "data-ai-metric": metric || label, "data-ai-value": String(value ?? "") },
    h(InfoButton, { metric, openFormula }),
    h("small", null, label),
    h("b", null, value)
  );
}

function ModernMetricCard({ label, value, sub, tone, metric, openFormula }) {
  return h("div", { className: `modernMetric ${classForValue(tone)}`, "data-ai-metric": metric || label, "data-ai-value": String(value ?? "") },
    h(InfoButton, { metric, openFormula }),
    h("span", null, label),
    h("strong", null, value),
    h("small", null, sub)
  );
}

function PanelChart({ title, meta, points }) {
  return h("div", { className: "panel" },
    h("div", { className: "panelTitle" },
      h("h3", null, title),
      h("span", null, meta)
    ),
    h(BarChart, { points, signed: true })
  );
}

function BarChart({ points, signed }) {
  const max = useMemo(() => Math.max(1, ...points.map((p) => Math.abs(Number(p.value || 0)))), [points]);
  return h("div", { className: "bars" },
    points.map((point) => {
      const value = Number(point.value || 0);
      const width = Math.max(4, Math.abs(value) / max * 100);
      return h("div", { className: "barRow", key: point.label },
        h("div", { className: "barLabel" },
          h("span", null, point.label),
          h("strong", { className: classForValue(value) }, signed ? signedRub(value) : plain.format(value))
        ),
        h("div", { className: "barTrack" },
          h("div", { className: `barFill ${classForValue(value)}`, style: { width: `${width}%` } })
        )
      );
    })
  );
}

function LineChart({ points, valueFormatter = signedRub }) {
  if (!points.length) {
    return h("div", { className: "chartEmpty" }, "Нет данных для выбранного фильтра");
  }

  const width = 720;
  const height = 220;
  const values = points.map((p) => Number(p.value || 0));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;
  const coordinates = values.map((value, index) => {
    const x = points.length === 1 ? width / 2 : index / (points.length - 1) * width;
    const y = height - ((value - min) / range * (height - 30)) - 15;
    return [x, y];
  });
  const line = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return h("div", { className: "lineChart" },
    h("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" },
      h("polyline", { className: "chartGrid", points: `0,${height - 28} ${width},${height - 28}` }),
      h("polygon", { className: "chartArea", points: area }),
      h("polyline", { className: "chartLine", points: line }),
      coordinates.map(([x, y], index) => h("circle", { key: index, cx: x, cy: y, r: 5, className: classForValue(values[index]) }))
    ),
    h("div", { className: "chartDateAxis" },
      points.map((point) => h("span", { key: point.label }, point.label))
    ),
    h("div", { className: "chartLegend" },
      points.map((point) => h("span", { key: point.label }, point.label, h("b", { className: classForValue(point.value) }, valueFormatter(point.value))))
    )
  );
}

function RadialMetric({ value }) {
  const clamped = Math.max(-25, Math.min(25, Number(value || 0)));
  const angle = 180 + (clamped + 25) / 50 * 180;
  return h("div", { className: "radialMetric", style: { "--angle": `${angle}deg` } },
    h("div", null,
      h("strong", { className: classForValue(value) }, formatPercent(value)),
      h("span", null, "ROI")
    )
  );
}

function StackedBreakdown({ points }) {
  const max = Math.max(1, ...points.map((p) => Math.abs(Number(p.value || 0))));
  return h("div", { className: "stackedBreakdown" },
    points.map((point) => {
      const value = Number(point.value || 0);
      return h("div", { className: "stackItem", key: point.label },
        h("span", null, point.label),
        h("div", { className: "stackTrack" },
          h("div", { className: `stackFill ${classForValue(value)}`, style: { width: `${Math.max(6, Math.abs(value) / max * 100)}%` } })
        ),
        h("strong", { className: classForValue(value) }, signedRub(value))
      );
    })
  );
}

function DetailTable({ title, rows, empty, modern }) {
  return h("div", { className: `${modern ? "glassPanel" : "panel"} tablePanel` },
    h("div", { className: "panelTitle" },
      h("h3", null, title),
      h("span", null, `${rows.length}`)
    ),
    rows.length === 0
      ? h("p", { className: "muted emptyTable" }, empty)
      : h("div", { className: "rows" }, rows.slice(0, 12).map((row, index) =>
          h("details", { className: "detailRow", key: `${row.title}-${index}` },
            h("summary", null,
              h("span", null,
                h("strong", null, row.title),
                h("small", null, row.subtitle)
              ),
              h("b", { className: classForValue(row.value) }, signedRub(row.value))
            ),
            h("dl", null, Object.entries(row.columns).map(([key, value]) =>
              h("div", { key }, h("dt", null, key), h("dd", null, value))
            ))
          )
        ))
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
