# Cross-industry practice guide: cannabis curing rooms, cacao drying, lot-tracking platforms

Why this file exists: dark-room drying and curing is far better documented for cannabis and cacao than for coffee, and the user wants those practices to guide coffee processing. The rule used here: borrow the **method** (staging, equalization, cool and slow, what to measure), and take **numbers** only where a coffee source or the user's own trials confirm them. Cannabis numbers come mostly from grower and producer articles, not peer-reviewed work (one source says plainly there is no published research tying moisture to shelf life or quality), so treat them as practice, not proof. The cacao source is a peer-reviewed review.

Sources: [Doctor Greenhouse](https://www.doctorgreenhouse.com/blog/drying-cannabis-is-there-a-science-behind-the-art), [Ed Rosenthal, Jan 2026](https://www.edrosenthal.com/ask-ed-blog/2026/1/21/cannabis-drying-and-curing-how-to-preserve-terpenes-smoothness-and-potency), [Review of cocoa drying technologies (PMC7732398)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7732398), [Cropster Origin](https://www.cropster.com/products/origin/).

## Practices worth adopting, and how they map to the coffee room

| Practice (source) | What it says | How it applies to coffee here |
|---|---|---|
| Heavy dehumidification first, light later (Doctor Greenhouse: heavy in the first 1-2 days, minimal as release slows) | Water load is front-loaded | Matches the coffee risk window (first 3-5 days, highest mold and OTA risk). Size dehumidifiers for the first days, not the average. The controller already works this way because it reacts to RH, but the sizing check should use the early rate. |
| Stepped RH setpoints (Rosenthal: 55 % RH for 3 days, then 60 % for 2 days, then 60 % cure) | Raise RH slightly as the surface dries, so the interior can catch up and the shell does not seal (case hardening) | A per-phase RH target for coffee is a sound idea. The controller has one `rh_target`; a phase schedule (target by days since loading or by lot moisture) is a design option. The actual coffee steps are for the user to set from trials; the cannabis steps are not coffee numbers. |
| Equalization or rest phase (Rosenthal: 9 days at 15 C, 60 % RH after drying; "internal moisture redistributes") | Surface and core moisture differ right after drying | Coffee equivalent: rest the lots in the dark room before closing drying, then measure again. A second reading after the rest catches a core that is wetter than the surface. Candidate rule for the Nectar Nomada drying-close step; not yet agreed. |
| Cool and slow keeps volatiles (Rosenthal: cooler temperatures reduce aroma loss; cacao review: above 60 C discouraged, 45 C best of those tested, high acetic acid retention with heat) | Heat costs aroma and raises acidity | Consistent with the 18-22 C requirement with AC and the 40 C bean limit in the platform. Supports delaying any heating or sun exposure. |
| Water-activity ladder (Doctor Greenhouse: bacteria stop below 0.9, spoilage molds below 0.7, all below 0.6; lipid oxidation also reduced below 0.6) | Same ladder as the coffee thresholds | Agrees with the sourced coffee table (about 0.61 for mold growth, aw 0.60 platform limit). Reinforces buying or borrowing an aw meter; the platform says "no aw measured" today. |
| Moisture check by snap test and meter (Doctor Greenhouse: end moisture 9-14 % cannabis; cacao review: 5-8 % cacao) | End points differ by crop | Do not carry numbers across. Coffee end point stays the user's 10.0-11.5 %. |
| Quality parameters tracked for cacao (review: moisture, pH, titratable acidity, acetic acid, mouldiness, OTA; cacao pH 3.8-5.5) | A defined parameter set per lot | For yeast-inoculated coffee, keep fermentation pH, brix and titratable acidity in the lot record next to the drying curve so a flavour result can be traced to both. |
| Longer drying means more mold exposure (cacao review: sun 7-22 days, solar greenhouse 4-7, oven at 45 C 33 h) | Slow is not automatically safe | The coffee room is deliberately slow (15-40 days), so the early days and the airflow carry the safety. Keep the 24 h no-decline mold rule and the first-days alerting. |

## What does not transfer
- Cannabis and cacao VPD or RH windows are not coffee setpoints. A fixed VPD still lets RH climb with room temperature (see `vpd-and-pi5-companion.md`), and cherry or parchment starts far wetter than flower.
- Cacao convective drying at 45-55 C is a different process from the dark room; it matters only if the user brings heated drying into the room.
- Nothing here replaces the user's platform thresholds.

## Lot-tracking platforms (Cropster Origin, RedEarthOne)
- Cropster Origin's public page describes lot management, processing status, storage location, inventory, sample comparison and reports "from cherry stage through customer delivery". It does not detail fermentation or drying data fields or sensor integrations. RedEarthOne could not be checked from public sources in this session.
- Use them as a reference for what a lot record should hold, not as a dependency. The record of truth for this room is the Nectar Nomada beneficio module; the room controller feeds it temperature, RH, dew point, absolute humidity and VPD. If an export to Origin is wanted later, flat daily CSV from `pi_logger.py` is the simplest bridge.
