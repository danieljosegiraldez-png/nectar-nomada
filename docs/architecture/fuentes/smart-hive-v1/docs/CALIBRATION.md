# Calibration, tare and measurement quality

## Scale procedure

Use calibrated masses/reference scale with uncertainty materially below the0.2kg target. Record certificate IDs, temperature, humidity, tray/stand configuration, cell serial and raw samples. No live hive can provide a known zero. Warm/settle the complete scale under the exact power-cycle timing used in operation.

1. Level and clear the mechanical gap. Include all permanently moving parts. Define zero convention: recommended displayed gross hive mass excludes the empty moving tray but includes all hive equipment placed on it. Structural120kg limit still includes moving tray mass.
2. Empty tray: collect10windows of15raw HX readings; verify stability. Record median per window, compare drift. For a new calibration, use empty-tray raw counts as0kg point.
3. Apply20kg and40kg minimum span, preferably add60/90kg up to approved maximum; record stable raw window estimates at each point ascending and descending. Do not exceed approved fixture capacity while calibrating.
4. Save a points JSON list such as `[[0,100],[20,20100],[40,40100]]`. **These numbers are synthetic format examples, never device coefficients.** Run tools/calibrate.py with config, points, unique calibrationID and a new output path. It fits counts=offset+slope×kg; either electrical polarity is accepted. It rejects small span, nonfinite values and residual>0.2kg.
5. Validate with independent masses not used for the fit and four-corner placement. Targets: error≤0.2kg0–120kg; repeatability≤0.1kg; no saturation. A poor corner test is usually mechanical, not a coefficient to “correct” in software.
6. Load the new config in physical service mode, preserving epoch/product. Archive old/new config, raw points, uncertainty, technician, timestamp and verification report. Run a final known-mass check.

Weight uses median absolute deviation to reject isolated spikes within15samples, then mean retained counts. It preserves raw samples and spread; it does not smooth across hourly observations, which could hide real honey/inspection changes. Window spread>0.2kg flags instability; platform health rules must exclude unstable records from automatic interpretation.

## Tare

Do not auto-tare at midnight, boot or after inspection. Empty-tray tare is a deliberate recalibration action with archived old offset and new calibrationID. Adding/removing hive equipment is an inspection/equipment event, not a reason to erase weight history. A net-honey display should be a backend derived view with documented equipment tare, retaining the gross raw/calibrated measurement.

## Other channels

- Battery: measure pack with a calibrated meter at3.3,3.7,4.2V equivalent bench inputs and compare ADC values. Fit effective gain/reference; target≤±50mV. Perform separate loaded voltage checks during radio bursts. Voltage alone is not accurate Li-ion state-of-charge.
- T/RH: co-locate both probes with reference in shaded stable air at two useful temperatures and at least two humidity points. Provisional installed target≤0.5°C and≤5%RH. Do not write casual offsets from human breath. Record factory sensor info and filter/cage influence; saturation/condensation intervals are quality flags, not precise humidity evidence.
- Pressure: compare station pressure to co-located calibrated reference, not weather app sea-level pressure. Target≤150Pa difference after settling; retain trim/raw values. No automatic altitude inference without reference conditions.
- Accel: six-face gravity check and level reference. Target tilt≤2° error near horizontal; document axis orientation. RMS is sample-band vibration, not a bee-wing frequency analyzer.
- Audio: stable reference tone to verify left channel, sign, sample rate and no bit shift. Compare RMS repeatability within±10% under fixed fixture; confirm mute/unplug generates faults. dB SPL requires a separate acoustic calibration not provided here.
- Light: dark/indoor/bright references; target repeatability≤10% and no unexpected clipping in actual placement. Default BH1750 configuration may saturate in full sunlight. Optical window losses are installed-system effects; label light as local ambient.
- Reed/latch: open/close20times including a full inspection while host is off. Next record must show latched/open, then clear only after commit. Multiple openings cannot be counted from one bit.
