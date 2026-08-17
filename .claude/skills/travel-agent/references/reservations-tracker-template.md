# Reservations Tracker Template

Every reservation that needs advance booking gets surfaced here, with the **deadline date computed for the actual trip dates** - not "book early" or "a few weeks ahead." Specific dates only.

---

## The Tracker Table

| # | What | Why advance | Lead time | Book by | Where to book | Status | Notes |
|---|---|---|---|---|---|---|---|
| 1 | [Restaurant name, city] | Sells out 30 days ahead | 30 days | [exact date] | [official URL] | ☐ Not booked | [no-show fee, cancellation policy] |
| 2 | [Museum / experience] | Timed-entry capped, sells out | 14 days | [exact date] | [official URL] | ☐ Not booked | [bring ID? printed ticket?] |
| 3 | [Train pass / city pass] | Cheaper if bought before arrival | 7 days | [exact date] | [official URL] | ☐ Not booked | [activation rules - first-use date locks the pass] |

---

## Categories to Cover

Run through every category. Skip the line for any category not applicable to the destination. Never silently omit a category - say "no advance reservations needed for this in [city]."

### 1. Flagship Restaurants

- Michelin-starred or chef-table restaurants in the city's signature cuisine
- The "if you only get one reservation here" restaurant per city
- Tasting menus (almost always need 30–60 days)
- Sunday brunch institutions in cities where Sundays are big (e.g., Lisbon, Madrid)

### 2. Timed-Entry Museums and Monuments

Many top sights are now timed-entry. Common ones:
- Vatican Museums and Sistine Chapel (Rome)
- Borghese Gallery (Rome)
- Alhambra (Granada)
- Sagrada Família (Barcelona)
- Anne Frank House (Amsterdam) - usually 60 days, drops at the same time daily
- Tower of London (London)
- Eiffel Tower summit (Paris)
- Empire State Building / 9-11 Memorial Museum (New York)

For Asia:
- Studio Ghibli Museum (Tokyo) - released first day of the month before, sells out in minutes
- Forbidden City (Beijing) - timed-entry, foreign passport required at entry
- Borobudur (Yogyakarta) - limited daily climb permits

### 3. Special Experiences

- Cooking classes
- Wine tastings (especially Champagne houses, Tuscan estates, Napa)
- Boat charters
- Hot-air balloon flights (Cappadocia, Luxor, Napa)
- Private guides
- Hammam appointments
- Spa bookings at full hotels
- Onsen reservations (some private ones in Japan)

### 4. Transit Passes and Tickets

- Eurail / JR Pass - must be bought before arrival
- City passes (London Pass, Paris Museum Pass, OMNIA Rome) - often cheaper online
- Reserved seat tickets on high-speed rail (TGV, Shinkansen, AVE) - open 30–90 days ahead, prices rise
- Domestic flights inside the destination - almost always cheaper booked early
- Rental cars - peak-season islands and small markets sell out

### 5. Lodging Confirmations

- Hotel reservation confirmation numbers
- Special requests acknowledged (high floor, quiet room, anniversary note)
- Early check-in / late check-out requests
- Airport-to-hotel transfer pre-arranged if relevant
- Loyalty number on the booking

### 6. Visa and Entry Documentation

If a visa or entry-permission system applies:
- Visa application deadline (some take 60+ days)
- ETIAS (Europe), ESTA (US), eTA (Canada), K-ETA (South Korea), ETA (Japan, expected) - apply 72+ hours ahead
- Cuban Tourist Card, Vietnam e-visa, Indian e-visa
- Passport 6-month validity rule

### 7. Vaccinations

- Yellow fever certificate - needs 10+ days lead time
- Japanese Encephalitis - multiple doses over weeks
- Routine boosters appointment
- Travel-clinic appointment for the destination

---

## How to Compute the "Book By" Date

Lead time is measured **backwards from the date the reservation is consumed,** not from today.

Example:
- Trip dates: October 14–22
- Restaurant on Day 4: October 18
- Lead time: 30 days
- Book by: September 18

Always show the actual computed date. Saying "30 days ahead" is not enough - the user needs the date on the calendar.

---

## Status Codes

- ☐ Not booked
- ⏳ Booking in progress
- ✅ Confirmed (with confirmation number)
- ❌ Did not get / unavailable - backup booked
- ⚠️ Watch - opens [date]

---

## What the Agent Does NOT Do

**Do not book on the user's behalf.** The skill surfaces the actions and deadlines. The user takes them.

The exception: If the user explicitly asks the agent to draft an email or fill in a form for their own copy-paste, that's fine. Drafting ≠ submitting.

---

## Tracker Format for the PDF Deliverable

In the final PDF, format the tracker as a table with one row per reservation, sorted by **Book by** date ascending. The earliest deadline is at the top - the user reads down the list and works the next item.

Add a one-paragraph header above the table:

> "These are the items that need action *before* the trip. Sorted by when each one expires. Anything still ☐ Not booked at trip start either gets skipped or replaced with the listed backup."
