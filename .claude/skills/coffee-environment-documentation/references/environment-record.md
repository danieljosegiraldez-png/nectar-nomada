# Environment record: what the room sends to the platform

Reasons are given so the fields can be challenged. Names match `pi_logger.py` where a field exists today; the rest are proposed and need the platform's naming rules (`docs/beneficio/00_conventions.md`) before they become models.

## Per sample (every few seconds to a minute, stored daily)
| Field | Exists in logger | Why |
|---|---|---|
| ts, iso | yes | order and gaps |
| t_in, rh_in, t_out, rh_out | yes | the raw truth |
| ah_in, ah_out, d_ah, dew_in, vpd_in | yes | what the controller decided on |
| mode | yes | CLOSED, DEHUMIDIFY, VENTILATE, PURGE, FAILSAFE |
| output states (compressors, fans, dampers, circulation) | partly | explains power use and heat |
| co2, rain | when sensors exist | safety and the rain gate |
| fault / guard reason | proposed | why FAILSAFE or a reading was rejected |
| room id, firmware/config version | proposed | which room, which thresholds |

## Per event
| Event | Fields |
|---|---|
| Mode change | from, to, reason text |
| Drastic or non-routine action requested | action, lot(s) affected, per-lot effect shown, approver, requested at |
| Approval, rejection, escalation | who, when, which level |
| Protective action after the 24 h wait | action, why, who can take over |
| Boot / power restore | time, compressor wait started |

## Rules agreed so far (from the brief, still open items marked)
- Routine actions the room takes alone; drastic actions or setting changes need the beneficio manager's approval, in the app or a beneficio-module screen, escalating to Daniel or the next level.
- 12 h waiting for the first approver, 12 h more after escalation, then the room takes a protective action; the manager can take over at any time. Open: the exact list of protective actions and what counts as drastic in v1.
- A reading is tied to a lot only through a person entering it (meter readings), never inferred by the room.
