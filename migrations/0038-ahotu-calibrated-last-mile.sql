-- 0038: Ahotu lane — calibrated manual last mile (live wizard walkthrough 2026-09-27).
-- Replaces the generic placeholder text on the Ahotu submission endpoint with
-- the exact step-by-step last mile from src/ahotu.ts AHOTU_MANUAL_LAST_MILE,
-- and marks the endpoint as requiring the (free) organiser account.

UPDATE media_submission_endpoints
SET manual_last_mile = 'EXACT MANUAL LAST MILE — AHOTU (wizard calibrated live 2026-09-27). A person performs every step; the Machine never submits.
0. FIRST check the event is not already listed (Ahotu deletes duplicates): https://www.ahotu.com/sport/nordic-walking
1. Sign in to the organiser dashboard (owner''s free organiser account): https://www.ahotu.com/p/profile/organiser — open "My events" -> "+ Add event".
2. SCREEN "Create event": Name* = the prepared event name, and in the name-language dropdown choose "English" (save validation rejects the form without a language). Official website = prepared URL. Year event started = prepared year. Contact: Email / Facebook / Twitter / Instagram / YouTube = prepared values. Organisation: leave "-" unless told otherwise. Click "Save" -> the edition wizard opens.
3. EDITION wizard, tab "General": Date* = the prepared edition date (calendar picker; tick "To be confirmed" only if the date is not final). Status: leave "Ok".
4. Tab "Descriptions": "Add description" -> language "English" -> paste the prepared description.
5. Tab "Registration": URL = prepared registration URL (Starts/Ends/Max participants only if prepared).
6. Tab "Location": Location* = type the prepared venue/city and pick the match from the search (Country/City set automatically); verify they are right.
7. Tab "Races": "Add a race" -> for each prepared race: Name = race name; Activity = "Nordic walking" (dropdown option, verified); Distance* = value + unit (Kilometer/Mile/...); Start Time if prepared; Location: On site (or Hybrid/Virtual if prepared); Terrain/Topography/Profile if prepared. Repeat "Add a race" for every distance.
8. Save the edition. New events enter "Waiting validation" automatically; Ahotu reviews before the event goes public. There is no delete control — never create test drafts.
9. When the event is live on ahotu.com, record its URL in ahotu_queue (markAhotuListed) and in media_distributions.external_url.
Official instructions: https://help.ahotu.com/article/22-how-can-i-add-an-event-to-ahotu',
    account_required = 1,
    cost_status = 'VERIFIED $0'
WHERE endpoint_id = 'ahotu-event-listings-pitch';
