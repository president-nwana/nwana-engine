# Google Ads — финальная архитектура аккаунта (intent-first)
**Дата:** 10 октября 2026, вечер. **Источники:** inventory snapshot id=1; реальные Search Terms за 26 авг – 10 окт 2026 (46 дней); Keyword Planner US/English.
**Статус:** предложение. Ничего не создавать до approve Albert.

## 0. Что показали данные (это важнее таблицы)

**Open Series — «успех» дутый.** 90%+ кликов — нерелевантные марафоны через AI Max: `berlin marathon 2026`, `copenhagen half marathon 2026`, `hyrox race`, `iron man maryland 2026`, `leadville 100 results`. Он-topic терминов всего два: `nordic walking classes`, `online walking` (2 клика). Конверсии 61.5 при 48 кликах — это page_view-инфляция, а не регистрации. Вердикт меняется с KEEP на **REBUILD**: выключить AI Max, перестроить ключи на exact/phrase вокруг nordic-walking интента.

**5K — трафик чужих забегов.** `5k runs near me` ($19.70/клик), `free 5k nyc`, `tunnels to towers 5k nyc`, `turkey trot 5k nashville`, `berlin marathon live`. Люди ищут локальные/чужие старты, а не наш виртуальный. Подтверждает тезис Albert: не инвестировать в legacy-структуру.

**Learn — единственный с настоящим интентом.** `nordic walking for beginners` (Exact): 1 клик → 21 конверсия. `nordic walking` (Exact): 51 показ, 4 клика, 5 конверсий. `nordic walking classes/courses near me`, `video`, `technique` — всё в точку. Проблемы: UK-утечка, неанглийские запросы, чужой бренд `nordixx poles`, generic-хвост. Это crown jewel аккаунта — чистим и расширяем, не трогаем ядро.

**AI Max — вредитель.** Обе «успешные» кампании сидят на AI Max, который и льёт марафонный мусор. Правило новой архитектуры: **exact + phrase only, никакого broad, никакого AI Max.**

**Конверсии — ванильные.** Везде conversions > clicks (1 клик → 2+ «конверсии»): счётчик крутит page_view. До постройки новой структуры нужны настоящие primary conversions: регистрация, донат, создание fundraiser, заявка/номинация инструктора, создание команды.

**Keyword Planner (US):**
| Фраза | Объём/мес | Конкуренция | Ставка top-page |
|---|---|---|---|
| virtual walking challenge | 720 | Medium | $0.97–$4.54 |
| walk for charity | 480 | Low | $2.67–$10.69 (выше нашего cap $2!) |
| free virtual walking challenge | 110 | Medium | $1.13–$4.76 |
| virtual running challenge | 110 | Medium | $0.92–$2.79 |
| workplace walking challenge | 30 | Low | $4.16–$25.88 (выше cap) |
| charity walking challenge | 10 | Medium | $1.98–$5.42 |
| corporate charity challenge | 10 | — | — |
| corporate team challenge | 10 | Low | — |
| nordic walking instructor course | 10 | Low | — |
| charity run virtual | 10 | — | — |
| employee engagement partnership | **no data** | — | — |
| become nordic walking instructor | **no data** | — | — |

Выводы: `virtual walking challenge` — главный объём новой структуры; `walk for charity` — объём есть, но ставки выше $2 cap (будем брать остатки аукциона); `employee engagement partnership` — не поисковый интент вообще, из search архитектуры исключить.

## 1. Guardrails (policy + quality)

По итогам проверки Albert (5% CTR больше не жёсткое правило): архитектуру строим вокруг **mission relevance, specific intent, no overly generic/single-word keywords, Quality Score, correct landing pages, clean search terms**. CTR — quality signal для мониторинга, не объект страха. Дополнительно: только Search, ставка ≤$2 (Ad Grants), никакого ремаркетинга. Sitelinks на всех кампаниях. Negative architecture обязательна. Запуск фазами.

## 2. Корзина 1 — Volume Drivers (спортивное участие)

| Campaign | Purpose | Volume (Evidence) | Landing (readiness) | Budget | Phase |
|---|---|---|---|---|---|
| Learn Nordic Walking (rebuild) | топ-фаннел обучение; единственный доказанный интент | Medium (search terms) | academy intro (ready) | $55–65 | 1 |
| Challenge Sport – Walking (new) | массовый challenge-интент | High (planner 720/mo) | challenges.nwaofna.org (ready) | $65–75 | 1 |
| Open Series (rebuild) | официальный спорт-хаб | Low (честно: текущий объём — мусор; истинный спрос unknown) | series.nwaofna.org (ready) | $45–55 | 1 |
| Challenge Sport – Running (new) | running-интент челленджа | Low-Med (planner 110/mo) | challenges.nwaofna.org (ready) | $25–35 | 2 |

### Learn Nordic Walking (rebuild in place)
- **Ad groups:** Beginners (`nordic walking for beginners`); Core (`nordic walking`); Classes near me (`nordic walking classes/courses near me`); Video & Technique (`nordic walking video`, `technique`).
- **Who/why:** новички ищут, как начать; near-me ищут классы. Трафик matters: самый дешёвый квалифицированный вход в экосистему (топ-фаннел для Challenge, Academy, instructor pipeline).
- **Keywords:** seed из search terms, exact + phrase. Примеры: [nordic walking for beginners], [nordic walking], "nordic walking classes near me", "nordic walking technique".
- **Negatives:** uk, british, london, oxford, adalah, "wat is", marcha, marche, nordica (foreign), nordixx (чужой бренд), "free courses", walking (single-word, policy).
- **CTA:** Start Free Intro → **Primary conversion:** course signup / registration. Secondary: video view.
- **Money/strategic outcome:** pipeline в Academy → инструкторы; участники Challenge. Прямых денег мало, стратегически — входная дверь.
- **Value path:** `nordic walking for beginners` → хочет научиться → academy intro → Start Free → signup → Academy → (инструктор / участник Challenge).
- **Overlap risk:** низкий; отгородить от Instructor Education минусами (`instructor course`, `certification` — туда).
- **Reuses:** существующая кампания, её search terms, academy intro page.

### Challenge Sport – Walking (new)
- **Ad groups:** Virtual walking challenge; Free virtual challenge; Charity walking challenge.
- **Who/why:** люди ищут виртуальный/благотворительный walking-challenge. Matters: 720/mo — крупнейший релевантный объём; прямой вход в Challenge.
- **Keywords:** [virtual walking challenge], "free virtual walking challenge", "charity walking challenge", "virtual step challenge" (phrase). Exact + phrase.
- **Negatives:** marathon, "half marathon", results, tracking, "near me" (продукт виртуальный), nyc (города), walking (single).
- **CTA:** Join Free → **Primary:** challenge registration. Secondary: team join.
- **Money/strategic:** участники → команды → fundraiser → донаты. Главный volume-движок новой структуры.
- **Value path:** `virtual walking challenge` → хочет участвовать → challenges.nwaofna.org → Join Free → registration → team/fundraiser/donation/repeat.
- **Overlap risk:** с Open Series — развести минусами (`series`, `competition`, `championship` → туда; `free`, `challenge` → сюда).
- **Reuses:** search term `online walking` из Open Series; challenges.nwaofna.org.

### Open Series (rebuild in place)
- **Ad groups:** NW Series (`nordic walking series`); NW Competition (`nordic walking competition`); NW Race generic (дедуплицировано с Challenge минусами).
- **Who/why:** соревновательный интент. Matters: официальный спорт должен жить отдельно (решение Albert); но честно — текущий «перформанс» был мусором, строим заново.
- **Keywords:** [nordic walking series], "nordic walking competition", [nordic walking race] — exact/phrase. AI Max ВЫКЛЮЧИТЬ.
- **Negatives:** marathon, berlin, copenhagen, ironman, triathlon, hyrox, results (чужих), tracking, free, challenge, charity (→ Challenge Sport).
- **CTA:** See Races / View Results → **Primary:** race registration. Secondary: results view.
- **Money/strategic:** Series как самостоятельный продукт; registrations.
- **Value path:** `nordic walking series` → ищет соревнования → series.nwaofna.org → регистрация на гонку → участник Series.
- **Overlap risk:** высокий с Challenge Sport — решается минусами в обе стороны (см. выше).
- **Reuses:** кампания, series.nwaofna.org, sitelinks на результаты/календарь.

### Challenge Sport – Running (new, phase 2)
- **Ad groups:** Virtual running challenge; Charity running.
- **Keywords:** [virtual running challenge], "charity running challenge", "virtual 5k running challenge" (дистанция как уточнение).
- **Volume:** Low-Med (planner 110/mo). **Negatives:** marathon, "half marathon", nyc, "near me", track (овальный).
- **CTA:** Join Free → registration. **Landing:** challenges.nwaofna.org (ready).
- **Value path:** как у Walking, running-аудитория.
- **Reuses:** структура Walking-кампании.

## 3. Корзина 2 — Money Intents (деньги)

| Campaign | Purpose | Volume (Evidence) | Landing (readiness) | Budget | Phase |
|---|---|---|---|---|---|
| Fundraise – Walk for Charity (new) | создание fundraiser'ов | Medium, bid-constrained (planner 480/mo, ставки >cap) | /fundraising (ready) | $35–45 | 1 |
| Donate (rebuild NWANA· Donate) | прямые донаты | Low/Unknown (hypothesis) | donate page (verify) | $15–25 | 2 |
| Teams / Workplace (new) | команды, corporate участие | Low (planner 30/mo) | /teams, /fundraising-teams (ready) | $10–20 | 2 |

### Fundraise – Walk for Charity (new)
- **Ad groups:** Walk for charity; Fundraising challenge; Team fundraising.
- **Who/why:** люди, уже ищущие благотворительную механику (`walk for charity` — 480/mo). Matters: самый горячий денежный интент в поиске.
- **Keywords:** [walk for charity], "fundraising walking challenge", "charity walk fundraiser", "team fundraising challenge". Exact/phrase. Осторожно: ставки $2.67+ выше cap — будем забирать остатки аукциона, доля показов будет скромной.
- **Negatives:** "tunnels to towers", "turkey trot" (чужие благотворительные забеги), marathon, volunteer, jobs.
- **CTA:** Start Fundraising → **Primary:** fundraiser created (прямой money outcome). Secondary: donation.
- **Value path:** `walk for charity` → уже хочет благотворительную механику → /fundraising → Start Fundraising → fundraiser created → direct money.
- **Overlap risk:** с Donate — развести: `fundrais*` → сюда; `donate` → туда.
- **Reuses:** /fundraising, механика fundraiser (проверена).

### Donate (rebuild существующей NWANA· Founding Circle · Donate)
- **Ad groups:** Donate NWANA; Support instructor education (когда оффер готов).
- **Who/why:** доноры. Честно: брендовых donate-запросов ~ноль; generic `donate to charity` держат гиганты. Кампания — ловля редкого высокоценного интента, не драйвер объёма.
- **Keywords:** [donate to nordic walking association] (exact, бренд), "support nordic walking nonprofit", "donate to walking charity" (phrase, осторожно).
- **Negatives:** volunteer, jobs, "tax deduction" (инфо-мусор), marathon.
- **CTA:** Donate → **Primary:** donation completed. Secondary: newsletter.
- **Landing:** donate page — readiness VERIFY (какой URL актуален: challenges.nwaofna.org/donate vs sport.nwaofna.org).
- **Value path:** `donate to walking charity` → хочет пожертвовать → donate page → Donate → direct money.
- **Reuses:** существующая кампания (пересобрать ключи/лендинг), conversion action donate_click.

### Teams / Workplace (new, phase 2)
- **Ad groups:** Team challenge; Workplace challenge.
- **Keywords:** "workplace walking challenge" (30/mo), "corporate team challenge" (10/mo), "virtual team challenge" (hypothesis).
- **Negatives:** jobs, hr software, "team building companies" (агентства).
- **CTA:** Create a Team / For Organizations → **Primary:** team created / org inquiry. Secondary: challenge registration.
- **Landing:** /teams, /fundraising-teams (ready). Org-история — /organizations (ready).
- **Value path:** `workplace walking challenge` → компания ищет employee challenge → /teams → inquiry → org relationship → workplace giving / sponsor.
- **Money outcome:** непрямой: umbrella teams, workplace giving, спонсорства. Strategic outcome: организации в экосистеме.
- **Bid caveat:** ставки $4.16+ выше cap — скромные ожидания по охвату.

## 4. Корзина 3 — Strategic Low-Volume Tests

| Campaign | Purpose | Volume (Evidence) | Landing (readiness) | Budget | Phase |
|---|---|---|---|---|---|
| Instructor Education (new) | заявки/номинации инструкторов (free model) | Low (planner 10/mo + реальные клики) | instructor page (needs page под free-модель) | $10–20 | 3 |
| Sponsor / Partner test (new, tiny) | проверка B2B-спроса | Unknown-Low (planner: 10/mo одна фраза, остальные no data) | /sponsors (verify CTA) | $5–10 | 3 |

### Instructor Education (new — после решения Albert по $95)
- **Ad groups (предложение):** Become an Instructor; Free Instructor Education; For Organizations.
- **Keywords:** [nordic walking instructor course] (10/mo), "nordic walking instructor near me" (реальные клики в Learn), "free nordic walking instructor training" (hypothesis). `become nordic walking instructor` — planner no data, держать как hypothesis-тест.
- **Negatives:** $95, price, cheap (если уходим от платной модели — решает Albert), jobs (вакансии).
- **CTA:** Apply / Nominate → **Primary:** application / organization nomination. Secondary: guide download.
- **Landing:** NEEDS PAGE под free-модель (не $95-курс). Гэп зафиксирован.
- **Value path:** `nordic walking instructor course` → хочет стать инструктором → instructor page → Apply → community distribution + future funding.
- **Money outcome:** непрямой: инструкторы → группы → участники → аудитория → спонсоры. Strategic: масштаб образования.
- **Зависимость:** сначала решение Albert (retire / keep / reposition $95), потом сборка.

### Sponsor / Partner test (new, tiny)
- **Условие:** только подтверждённый спрос. Planner: `corporate charity challenge` — 10/mo (берём); `employee engagement partnership` — no data (исключаем, это был бред брифа).
- **Ad groups:** один — Corporate charity challenge.
- **Keywords:** [corporate charity challenge] exact + 2–3 phrase-варианта. Всё.
- **Negatives:** jobs, "sponsorship jobs", grants (гранты как финансирование, не спонсорство).
- **CTA:** Become a Partner → **Primary:** partner inquiry. 
- **Landing:** /sponsors — VERIFY CTA под inquiry (сейчас страница витринная?).
- **Правило убийства:** 30 дней без demand → закрыть тест, направление остаётся для outreach (не для search).
- **Value path:** `corporate charity challenge` → компания ищет благотворительный формат → /sponsors → inquiry → relationship.

## 5. Always-on

### Brand (keep + clean)
- Ключи: nwana, nordic walking association of north america, опечатки — exact. Убрать не-бренд (instructor, races, courses — они теперь в своих кластерах).
- Sitelinks добавить (сейчас 0). Budget $15–20. Phase 1. Volume: Low (hypothesis).

## 6. Legacy → Final (миграция)

**Transition (сейчас):** 6 recurring race-кампаний — keep как есть (даты обновляет Albert), не инвестировать. Sponsors — PAUSE (подтверждено). Instructor $95 + Waitlist — не трогать до решения по офферу. Open Series — rebuild (не keep). Learn/Brand — чистка.

**После проверки новых кампаний — REMOVE (не кладбище пауз):**
| Удаляем | Куда переехал интент |
|---|---|
| 1K/3K/5K/10K/15K/20K races | Challenge Sport (участие) + Open Series (соревнования); ключи пересобраны exact/phrase |
| Instructor $95 | новая Instructor Education (по решению Albert) |
| Waitlist | новая Instructor Education |
| Sponsors | тест в корзине 3 (если жив); иначе только outreach |
| NWANA· Series 2026 | Open Series |

REMOVE в Ads обратим; данные остаются в отчётах. Потеря history приемлема — она была мусорной (AI Max).

## 7. Phase 0 — перед запуском (обязательно)

1. **Конверсии:** определить настоящие primary (challenge registration, donation completed, fundraiser created, instructor application/nomination, team created); page_view — в secondary/observation. Без этого оптимизация слепая.
2. **Выключить AI Max** на всех существующих кампаниях — немедленно.
3. **Shared negative list** (из раздела 0): marathon*, ironman, triathlon, hyrox, results чужих, tracking, uk/british, adalah/wat is/marcha/marche, nordixx, "free courses", туннели/индейки (tunnels to towers, turkey trot).
4. **Landing gaps:** /donate актуальный URL — verify; instructor free-model page — needs page; /sponsors CTA — verify.
5. **Search Terms mining** — еженедельный ритуал: hidden bucket "Other search terms" держит до половины конверсий.

## 8. Бюджетная сводка (номинал, $329 cap)

Phase 1 (сейчас): Learn 60 + Walking 70 + Open Series 50 + Brand 20 + Fundraise 40 = 240
Phase 2: Running 30 + Donate 20 + Teams 15 = 65 (итого 305)
Phase 3: Instructor 15 + Sponsor test 9 = 24 (итого 329)

Номинал — это приоритет в аукционе, не фактический расход. Факт сейчас ~$39/день; цель — существенно больше за счёт покрытия Challenge-интента (720/mo флагман) и чистых ключей.

## 9. Ограничения данных (честно)

- Доказано: search terms 46 дней (3 кампании), planner объёмы (12 фраз), инвентарь 14 кампаний.
- Не доказано: тексты объявлений (дефект чтения скрипта — все headlines пустые); разбивка конверсий по типам; истинный объём брендового и donate-спроса (hypothesis); отработает ли `walk for charity` при ставках выше cap (узнаем только тестом).
- Все бюджеты и фазы — предложения. Создавать — только после approve.
