"""Battery-terminal energy scenarios. Assumptions, not product lifetime promises."""
import json
capacity_mah=6600;usable_fraction=0.7
for idle_ma,session_s in [(0.1,30),(0.3,120),(1.5,300),(20,30)]:
    active_mah=40*24*8/3600
    charge=idle_ma*(24-24*8/3600)+active_mah+500*session_s/3600
    print(json.dumps({'idle_ma':idle_ma,'session_s_day':session_s,
      'mah_day':round(charge,3),'days_70pct':round(capacity_mah*usable_fraction/charge,1)}))
