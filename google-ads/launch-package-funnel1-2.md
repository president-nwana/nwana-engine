# Launch Package — первые две воронки (Volume + Money)
**Дата:** 10 октября 2026. **Статус:** подготовлено к запуску. Ничего не создано — ждёт approve Albert.
**Правило:** всё создаётся в статусе PAUSED; Albert ревьюит и нажимает Enable («presses Send»).

## Воронка 1 — Challenge Sport · Walking (объём)
**Почему первая:** `virtual walking challenge` — 720/мес, крупнейший релевантный объём (Keyword Planner, US).

**Настройки кампании:**
- Название: `NWANA · Challenge Sport · Walking`
- Тип: Search. Сети: Google Search ON, партнёры OFF, Display OFF.
- Гео: United States, Presence (geo_target_id 2840).
- Ставки: Manual CPC, default $1.50 (cap гранта $2.00).
- Бюджет: $70/день.
- Статус при создании: PAUSED.

**Ad groups и ключи (только EXACT/PHRASE):**

AG «Virtual Walking Challenge» → лендинг https://challenges.nwaofna.org/
- [virtual walking challenge] EXACT — Planner 720/мес
- "virtual walking challenge" PHRASE
- [online walking challenge] EXACT — close variant; `online walking` был в реальных search terms
- "online walking challenge" PHRASE
- [virtual step challenge] EXACT — variant
- "virtual step challenge" PHRASE

AG «Free Virtual Challenge» → https://challenges.nwaofna.org/
- [free virtual walking challenge] EXACT — Planner 110/мес
- "free virtual walking challenge" PHRASE
- [free walking challenge] EXACT
- "free walking challenge" PHRASE
- [free virtual challenge] EXACT — наш продукт буквально free virtual challenge

AG «Charity Walking Challenge» → https://challenges.nwaofna.org/fundraising
- [charity walking challenge] EXACT — Planner 10/мес
- "charity walking challenge" PHRASE
- [charity walk challenge] EXACT
- "charity walk challenge" PHRASE

**Объявления (RSA; все заголовки ≤30, описания ≤90 — проверено):**

AG Virtual Walking Challenge:
- H: Free Virtual Walking Challenge | Join the NWANA Challenge | Walk Anywhere, Anytime | Track Miles, Earn Recognition | All Levels Welcome | Walk for a Good Cause | Free to Join — Start Today | Virtual Walking Challenge 2026
- D: Join the free virtual walking challenge and support instructor education. | Free to join. Track miles, join teams, climb leaderboards — every mile counts. | Walk anywhere, anytime. Register free and turn your miles into impact.

AG Free Virtual Challenge:
- H: Free Virtual Walking Challenge | 100% Free to Join | No Fees, Just Walking | Join Free Today | Virtual Challenge — Free | Walk for Charity, Free | Start Walking Free | Free Walking Challenge
- D: The NWANA Charity Challenge is completely free. Register and start walking today. | Free participation, real impact. Your miles support free instructor education.

AG Charity Walking Challenge:
- H: Charity Walking Challenge | Walk for a Cause | Turn Miles Into Donations | Charity Challenge 2026 | Walk. Fundraise. Impact. | Join the Charity Challenge
- D: Turn your miles into fundraising for free instructor education. Join free. | Join the charity walking challenge. Walk, fundraise, and grow the mission.

**Sitelinks (4):** How It Works → /how-it-works | Create a Team → /teams | Disciplines → /disciplines | Fundraising → /fundraising

**Campaign negatives:** series, competition, championship, official, results, near me. Плюс attach shared-листа «NWANA Global Junk 2026-10».

**Primary conversion:** challenge registration. CTA на лендинге: Register Free / Join Free — проверено, есть.

## Воронка 2 — Fundraise · Walk for Charity (деньги)
**Почему вторая:** `walk for charity` — 480/мес, самый горячий денежный интент. Оговорка: ставки top-page $2.67+ выше cap $2 — будем забирать остатки аукциона, доля скромная, но интент того стоит.

**Настройки кампании:**
- Название: `NWANA · Fundraise · Walk for Charity`
- Тип: Search. Сети: Google Search ON, партнёры OFF, Display OFF.
- Гео: United States, Presence (2840).
- Ставки: Manual CPC, default $1.50.
- Бюджет: $40/день.
- Статус при создании: PAUSED.

**Ad groups и ключи:**

AG «Walk for Charity» → https://challenges.nwaofna.org/fundraising
- [walk for charity] EXACT — Planner 480/мес
- "walk for charity" PHRASE
- [walking for charity] EXACT
- "walking for charity" PHRASE

AG «Fundraising Challenge» → https://challenges.nwaofna.org/fundraising
- [fundraising walking challenge] EXACT
- "fundraising walking challenge" PHRASE
- [charity walk fundraiser] EXACT
- "charity walk fundraiser" PHRASE

AG «Team Fundraising» → https://challenges.nwaofna.org/fundraising-teams
- [team fundraising challenge] EXACT
- "team fundraising challenge" PHRASE
- [fundraising team challenge] EXACT
- "fundraising team challenge" PHRASE

**Объявления:**

AG Walk for Charity:
- H: Walk for Charity | Turn Miles Into Donations | Start Fundraising Today | Charity Walking Challenge | Raise Funds Walking | Your Miles, Their Future | Walk. Raise. Impact.
- D: Create a free fundraiser and turn every mile you walk into support. | Walk for charity with NWANA. Start fundraising in minutes — free to join.

AG Fundraising Challenge:
- H: Fundraising Walking Challenge | Walk & Fundraise | Take the Challenge, Help Others | Join the Fundraising Challenge
- D: Join a fundraising walking challenge where your miles fund free instructor education. | Free to join. Walk, fundraise, and multiply your impact with a team.

AG Team Fundraising:
- H: Team Fundraising Challenge | Fundraise as a Team | Start a Fundraising Team | Teams That Give Back
- D: Create a fundraising team and multiply your impact. Free to start. | Walk together, fundraise together. Launch your team in the Charity Challenge.

**Sitelinks (4):** Start Fundraising → /fundraising | Fundraising Teams → /fundraising-teams | Donate → /fundraising | How It Works → /how-it-works

**Campaign negatives:** volunteer, jobs, free. Плюс shared-лист.

**Primary conversion:** fundraiser created. CTA на лендинге: Start Fundraising — проверено, есть.

## Revenue / Value Path

**Воронка 1:** `virtual walking challenge` → хочет участвовать → challenges.nwaofna.org → Join Free → registration → team / fundraiser / donation / repeat participation. Объём → воронка.

**Воронка 2:** `walk for charity` → уже ищет благотворительную механику → /fundraising → Start Fundraising → fundraiser created → direct money. Деньги напрямую.

## Блокеры до запуска (честно)

1. **Трекинг конверсий — hard blocker для обеих воронок.**
   - Воронка 1: `registration_click` существует, но 0 за 90 дней. Надо проверить, срабатывает ли на реальной регистрации Challenge. Если тег мёртв — чинить до запуска, иначе оптимизация слепая.
   - Воронка 2: `fundraiser_created` **не существует**. Нужен GA4 event + conversion action (работа на сайте). Без этого воронку не запускаем — это ровно та ошибка, которую только что исправили с page_view.
2. **Approve пакета** (этот документ).
3. **Путь сборки:** рекомендую Engine (desired-state → скрипт строит PAUSED — durable, переиспользуемо) вместо ручной сборки в UI. Нужна инженерная работа: закодировать 2 CampaignSpec в orchestration layer.
4. **Технический нюанс:** in-account скрипт НЕ умеет создавать negative keywords — минусы на новые кампании ставятся через UI (или дорабатываем скрипт). Учтено в последовательности.

## Landing readiness

- challenges.nwaofna.org — 200, CTA Register Free / Join Free / Start Fundraising / Create a Team на месте. READY.
- /fundraising — 200, CTA Start Fundraising + Donate на месте. READY.
- /fundraising-teams — 200 (запущена 10.10). READY.
- /how-it-works, /teams, /disciplines — в канонической карте сайта. READY.

## Последовательность запуска

1. Approve пакета (Albert).
2. Проверка/починка трекинга конверсий (обе воронки).
3. Кодирование 2 CampaignSpec в Engine → deploy → скрипт строит PAUSED (или ручная сборка в UI — на решение).
4. Навесить shared negative list + campaign negatives на новые кампании (UI).
5. Ревью Albert: networks, locations, bidding, ads, sitelinks → Enable («presses Send»).
6. Еженедельный mining search terms; первая проверка через ~7 дней после включения.

## Открытые решения для Albert

1. Пакет в целом — approve?
2. Путь сборки: Engine (рекомендую) vs ручной UI?
3. Бюджет $70 / $40 — ок?
4. Трекинг: чиним registration_click и создаём fundraiser_created до запуска (моя рекомендация — да).
