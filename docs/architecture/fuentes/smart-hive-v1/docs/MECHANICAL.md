# Load path, fiberglass tray and analytical stress review

## Status

**Analytical screening only. No CAD-based FEA, coupon testing or physical proof-load test has been performed.** Laminate schedule, elastic properties, hole geometry, cell deflection, mount torque, actual hive footprint and wind site are missing. A fabrication-ready composite drawing cannot honestly be frozen from the original prose. Dimensions below are a reference envelope to develop, not released tooling dimensions.

## Reference configuration [D]

Single-point ANYLOAD108MA-150kg candidate, with reference600×500mm moving platform inside its published610×700mm platform envelope. A150kg rating includes tray/dead load; provisional normal maximum120kg gross gives20% static capacity reserve, not a safety factor for impact. Use a stiff structural insert/chassis and machined mounting pads inside a weather-protective fiberglass tray. Fixed end bolts to base subframe; moving end bolts only to top subframe. Follow the manufacturer's arrow and actual drawing. Free flexure regions must never be clamped or filled with adhesive. [Manufacturer](https://www.anyload.com/product/108ma-single-point-load-cell/).

The cheaper108TA-150kg is not an approved substitute: its400×450mm reference platform is smaller. Its40mm cell body alone exceeds the earlier38.1mm total-height proposal. The selected108MA also requires a new stack-up. Allow a provisional80–100mm envelope for layout exploration, then derive actual height from the drawing; do not promise1.5in. No machining hole spacing or bolt length may be taken from that exploratory envelope.

## Load-path drawing

```
hive corners -> stiff moving top/ribs -> upper mounting pad -> cell moving end
                                                         strain flexure
stand/feet  <- stiff fixed base       <- lower mounting pad <- cell fixed end
```

Corner stops connect top to base only outside the weighing range. Flexible sensor cables get slack loops; tight cables, weeds, propolis, straps and drainage lips must not bridge the moving gap. Anchor hive to the moving frame and anchor fixed base separately to the stand; a strap directly spanning hive to fixed stand creates an unknown bypass/preload. Lateral restraints require flexures or clearance and controlled engagement, not frictional sliding guides in the weighing load path. Anti-lift retention is independent of downward stops.

## Calculations [D]

Gravity g=9.80665m/s².120kg gives1177N;150kg gives1471N. A90kg hive whose center is displaced0.20m creates a176.5N·m moment. A single-point cell's eccentric compensation is conditional on correct mount and permitted platform geometry; capacity alone does not establish allowable lateral moment.

Illustrative wind case (not a site code load): air density1.2kg/m³, drag coefficient1.2, projected area0.6m², speed30m/s, pressure-resultant height0.8m. F=0.5ρCdAv²=388.8N and M=311N·m. A0.50m-wide support requires a622N vertical couple to resist that moment. This can unload a corner or overload local structure even if scale gross mass is below120kg. Use site wind analysis and physical tie-down design before outdoor deployment.

Illustrative impact: a10kg super dropped20mm contains1.96J potential energy. Arrest over1mm corresponds to roughly1961N average additional force, before static mass or peak amplification. The cell's nominal static overload rating must not be used to approve dropping boxes or standing on the platform. Set boxes down gently.

A simple beam screen gives δ=FL³/(48EI) for central load. At F=1177N,L=0.5m and δ≤0.0005m, required effective EI≥6130N·m² for that one idealized load path. A plate/ribbed sandwich is not this beam. Use measured wet/hot orthotropic laminate properties and actual joints in FEA; do not assign a generic “fiberglass modulus” as a finished design.

## Stops and tolerances

Reject a universal2mm gap. For each corner measure normal worst-case displacement δ_normal,max including eccentric load, creep, temperature and manufacturing errors. Set gap g_stop > δ_normal,max + tolerance + clearance margin, but < displacement at the cell's permitted overload or local failure. If those inequalities cannot both be met, redesign the stiffness/stop arrangement. Stops are adjustable, lockable and inspectable; use rigid pads on structural inserts. Elastic bumpers can creep and engage early.

Design checks before tooling: bonded-in metal load-spreader inserts and crush sleeves; bolts cannot bear directly through unsupported laminate; compression, pull-through, adhesive peel, buckling, interlaminar shear and fatigue all require evaluation. Stainless/aluminum interfaces need corrosion isolation. Drainage must not drain into battery compartment. UV-protected resin/coating, sealed cut edges and replaceable non-contact pest/propolis barriers are required. Keep metal inserts away from antenna region; no carbon fiber/metal foil near antenna.

## Physical load tests [D targets, NOT RUN]

- Measure zero/gaps with tray empty; document cell serial, pad flatness, fastener torque from supplier, total moving dead weight and stand level.
- Center and each corner at20,60,90,120kg gross, ascending and descending three times. Target absolute error≤0.2kg and corner-to-center variation≤0.2kg after calibration; no stop contact in normal range.
- Hold90kg24h and120kg1h. Target zero return≤0.1kg after unloading/settling, no permanent deformation, cracks, delamination or loose inserts. Record thermal drift separately.
- Proof-load1.25×normal gross=150kg only after approved stop design and test fixture; measure whether stops carry load as intended. Never test225kg simply because a catalog lists150% safe overload. Ultimate rating is not a field test instruction.
- Apply approved lateral/anti-lift test with inert weights, controlled rig and exclusion zone; measure force/displacement. Wind example above is a sizing prompt, not a passed requirement.
- Repeat accuracy after wet/hot conditioning and transport vibration. Install on hive only after structural reviewer signs the traceable report.
