# Coffee microparcel video extension — pilot purchase and research specification

Decision updated from user input: coffee; one selected plant with bagged branches and open comparison branches; record both flowers and hive entrance. Coffee species/cultivar, stingless-bee species, actual insect size, working distance and Roubik protocol version remain unknown. This is an expansion design, not implemented camera firmware or a validated insect classifier.

## Purchase one optical pilot first

| Role | Exact candidate | Quantity for ONE pilot | Observed price USD | Link |
|---|---|---:|---:|---|
| Flowers | Raspberry Pi High Quality Camera, C/CS mount, Sony IMX477; Adafruit 4561 | 1 | 55.00 | https://www.adafruit.com/product/4561 |
| Flower lens | CGL 16 mm 10 MP C-mount lens; Adafruit 4562 | 1 | 77.50 | https://www.adafruit.com/product/4562 |
| Hive entrance | Raspberry Pi Camera Module 3 Standard, visible colour/IR-cut; Adafruit 5657 | 1 | 29.25 | https://www.adafruit.com/product/5657 |
| Recorder | Raspberry Pi 5, RAM SKU selected at checkout after capture benchmark; 2 GB is initial candidate | 1 | Quote required | https://www.raspberrypi.com/products/raspberry-pi-5/ |
| Cables | Official Pi 5 22-pin to camera 15-pin FPC, lengths selected from mounting drawing | 2 total | Quote; HQ listing currently includes one | See camera listings |
| Storage/power/weatherproofing | Endurance microSD, regulated 5 V supply, independent fused battery/charger, ventilated recorder housing, optical windows, rigid mounts | 1 set | Not quoted; hold for power/site survey | Separate from hive battery |

Camera/lens subtotal $161.75 before tax/shipping. This is NOT a complete video kit price. Adding the entrance module adds $29.25 plus its cable, enclosure and mount to the shared recorder; a second independent recorder may be necessary if hive and flower positions are too far apart. Do not assume long unbuffered CSI ribbon runs are reliable. Price/stock snapshots accessed 2026-09-16, not checkout guarantees. Florida 33195 sourcing follows FLORIDA_PURCHASE_PLAN.md; these items can join the sensor order if seller/address eligibility permits.

Use the HQ + 16 mm combination for a flower cluster, not the entire plant. Camera Module 3 Standard is the economical alternative for a close flower trial, but has a wider view at a given distance. NoIR and wide-angle variants are not the default identification camera. The AI Camera does not provide a ready-trained local bee-species recognizer.

## Optical reasoning and limits

[R] HQ sensor is 4056 × 3040; the manufacturer's reference 16 mm lens has approximately 22.2° horizontal field of view and specified minimum object distance 0.2 m. The module's advertised still resolution is not the number of pixels in a 1080p video frame. See https://www.raspberrypi.com/documentation/accessories/camera.html and https://www.raspberrypi.com/products/raspberry-pi-high-quality-camera/ .

[D] At 0.30 m, geometric width = 2 × 0.30 × tan(22.2°/2) ≈ 0.118 m. A hypothetical 5 mm insect occupies about 81 pixels along its length in a 1920-pixel-wide frame, or 172 pixels in a full-width 4056-pixel still. At 0.50 m these become about 49 and 103 pixels. These are planning estimates: close-focus breathing, sensor crop, insect angle, focus and compression change the actual result. Measure field width with a ruler at the flower plane. Smaller insects need a narrower field or a different macro lens. Do not buy three sets until the smallest target insect passes the pilot.

[D] Start at roughly 25–35 cm working distance with a rigid independent post, selected flowers filling a 10–15 cm view. Focus manually at the flower plane and lock lens rings. Confirm the entire chosen flower depth stays sharp as branches move. Adjust aperture for depth versus shade exposure; do not tie or restrain branches in ways that change visits without logging that intervention. Keep cameras, cables and roofs out of insect flight paths and off the weighing tray.

Start capture trials at 1080p 50 fps and approximately 1/1000 s exposure in adequate daylight, comparing 1/2000 s for fast motion against noise. Frame rate alone does not stop blur. At 1 m/s an insect travels 1 mm during 1/1000 s—about 16 pixels in the example frame. Therefore landing/feeding frames are the principal identification evidence; departures and arrivals support counts/direction, not guaranteed wing-detail or individual tracking. Higher-resolution still bursts can supplement video; actual simultaneous capture throughput must be benchmarked. Shade may make the proposed shutter impractical without changes to optics or recording conditions. Do not add lights that change behavior without an explicit experimental treatment.

## Pilot acceptance — engineering targets, not established biological guarantees

1. Place a millimetre ruler and 3/5/10 mm targets in the actual flower plane. Save original video and full-resolution stills through the final protective window. Measure pixels per insect; target at least 100 body-length pixels in usable identification stills. This threshold is a screening target, not proof of taxonomic resolution.
2. Record morning, midday, cloud/shade and wind conditions. Require visible head/thorax/abdomen detail in landed visitors, no focus hunting, clipping, fog or compression destroying features. Mark every unidentifiable visit as unknown rather than guessing.
3. Obtain at least 100 manually reviewed visits across representative conditions when available, with independently verified reference photographs/specimens where appropriate. Have an entomologist label the supported taxonomic level. For the agreed broad groups, provisional gate: ≥90% agreement on a held-out, independently reviewed set; report unknown rate and confusion matrix separately. Species-level labels remain disabled unless validated for those species. Do not split neighboring frames of the same visit between training and validation.
4. Verify arrival/departure counts against manual annotations: target precision/recall ≥90% for visible crossings, separately by conditions. Occlusion and out-of-frame paths remain unknown. Two cameras cannot establish that an individual at the plant came from the monitored hive.
5. Require ≥95% scheduled recordings complete for seven days; checksum all originals, record dropped frames and time uncertainty. For cross-camera timing target ≤1 s offset, verify each day. Simultaneous two-camera recording is required for temporal comparison; sequential clips must be labelled non-simultaneous.

## Experimental interpretation

[R] Roubik's 2002 coffee study compared open-pollinated branches with fine-mesh-bagged branches that excluded pollinators. The publication provides a useful basis, not a complete ready-to-copy protocol for this site: https://stri-apps.si.edu/docs/publications/pdfs/Roubik_coffeepollination.pdf .

[D] Keep the bagged exclusion branch closed during the defined exclusion interval, preferably starting before flowers open under the approved study protocol. Film visits on a matched OPEN branch, without shooting through the exclusion mesh. Photograph bag condition and record bagging/removal times, mesh, branch identity and any damage. Opening a bag for camera visibility changes the treatment. A bagged branch is not expected to show normal pollinator access. Net effects on temperature/humidity/shade are potential confounders; record them and consider a sham-bag treatment with the research lead.

One plant is an optical/method pilot. Multiple flowers on one plant do not create independent plants or replicated microparcels. For inference, predefine and randomize comparable branches/plants across blocks, document initial flower counts, follow tagged flowers to fruit set and ripening, weigh harvest, and account for plant/block clustering. Determine replication from pilot variance and desired effect, not an invented sample size. Coffee species/cultivar matters; do not transfer arabica findings automatically to canephora.

Record visitor group/species if defensible, arrival/departure, visit duration, flower contacted, visible reproductive-part contact, confidence and observer/model version. A flower visit or apparent contact is not itself proof of pollen transfer, fertilization or yield benefit. Link later fruit outcomes and, if the research question requires it, a separate pollen-deposition protocol. Cameras cannot identify a visitor's hive of origin without validated marking/tracking.

## Recording, storage and power

Start with a configurable stratified schedule (example: six two-minute windows per daylight day), expand across flowering peaks and rotate window timing to reduce fixed-time bias. Record scheduled minutes, usable minutes and number of visible open flowers; normalize visitation by observed flower-minutes. Missing footage is missing effort, not zero visitors. Fruiting/ripening can use lower-frequency stills, with occasional video when needed.

At assumed 4 Mbit/s, two minutes × six/day = 360 MB/day/camera; two views are 720 MB/day and 5.04 GB/week before stills, filesystem and overhead. Bitrate is a planning assumption requiring quality testing. Keep originals on local storage, copy with SHA-256 verification over USB/Wi-Fi, and send small manifests/metrics to the platform. Do not stream these clips over the Notecard data allowance.

Use one separately powered Pi 5 recorder for both views when short cables and optical placement permit; Pi 5 has two camera/display interfaces. Its recommended 5 V/5 A supply rating is not a measured continuous consumption. Measure start, record, idle and shutdown energy. Example only: 8 W × 20 minutes/day = 2.67 Wh/day active; boot, standby, conversion losses and weather reserve add to this. Shut down Linux cleanly before an external timer cuts power; never use the hive MCU's sensor rail for video. Battery/solar sizing and exact recorder/power SKUs are HOLD until this measurement and site survey.

Implementation backlog for Claude: a separate Linux capture service with bounded sessions, simultaneous-camera benchmark, validated schedule, clock-quality capture, atomic .partial→final rename after close/fsync, SHA-256 manifest, free-space checks, resumable upload, retention only after verified durable copy, and no automatic taxonomic claim. Hive sampling must remain operational if the recorder is disconnected or fails.
