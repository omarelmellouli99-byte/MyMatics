import pandas as pd
import numpy as np
import time
import random
from datetime import datetime, timedelta

def interpolate(p1, p2, n=13):
    lats = np.linspace(p1[0], p2[0], n)
    lons = np.linspace(p1[1], p2[1], n)
    return list(zip(lats, lons))

KEY_POINTS = [
    (48.8800, 2.3550),
    (48.9300, 2.3200),
    (48.9800, 2.2800),
    (49.0300, 2.2450),
    (49.0800, 2.2150),
    (49.1300, 2.1950),
    (49.1800, 2.1750),
    (49.2300, 2.1550),
    (49.2800, 2.1420),
    (49.3300, 2.1320),
    (49.3800, 2.1250),
    (49.4300, 2.1200),
    (49.4800, 2.1150),
    (49.5300, 2.1080),
    (49.5800, 2.1000),
    (49.6300, 2.0940),
    (49.6800, 2.0880),
    (49.7300, 2.0820),
    (49.7800, 2.0760),
    (49.8300, 2.0700),
    (49.8550, 2.0900),
    (49.8750, 2.1500),
    (49.9000, 2.2958),
]

# Génère exactement 300 points
COORDS = []
for i in range(len(KEY_POINTS) - 1):
    COORDS += interpolate(KEY_POINTS[i], KEY_POINTS[i+1], n=14)
COORDS = COORDS[:300]

def generate_row(lat, lon, timestamp, i):
    return {
        'DATE(DD/MM/YY)':     timestamp.strftime('%d/%m/%Y'),
        'TIME(hh:mm:ss)':     timestamp.strftime('%H:%M:%S'),
        'CAN-LATITUDE':       int(lat * 1e7),
        'CAN-LONGITUDE':      int(lon * 1e7),
        'CAN-ALTITUDE':       int(random.uniform(20, 120) * 1e3),
        'CAN-ENGINERUNHOURS': round(12054 + i * 0.01, 1),
        'CAN-FUEL-RATE':      round(random.uniform(4.5, 7.5), 1),
        'CAN-LOAD%':          round(random.uniform(40, 80), 1),
        'CAN-RPM':            int(random.uniform(800, 1800)),
        'CAN-T-COOLANT':      round(random.uniform(75, 95), 1),
        'CAN P-OIL':          round(random.uniform(3.5, 5.5), 1),
        'CAN P-OIL.1':        round(random.uniform(3.5, 5.5), 1),
        'CAN-P-INTAKE':       round(random.uniform(1.0, 2.5), 1),
        'CAN-BATTERY VOLT':   round(random.uniform(24.0, 28.0), 1),
    }

def run_cycle(cycle_number):
    start_time = datetime.now()
    print(f"\n🚂 Cycle {cycle_number} — Départ Paris → Amiens ({start_time.strftime('%H:%M:%S')})")
    print(f"   {len(COORDS)} points à générer")

    first_row = generate_row(COORDS[0][0], COORDS[0][1], start_time, 0)
    pd.DataFrame([first_row]).to_csv('data.csv', index=False)
    print(f"  Point 1/{len(COORDS)}")

    for i in range(1, len(COORDS)):
        lat, lon = COORDS[i]
        timestamp = start_time + timedelta(seconds=i * 30)
        row = generate_row(lat, lon, timestamp, i)

        df = pd.read_csv('data.csv')
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
        df.to_csv('data.csv', index=False)

        print(f"  Point {i+1}/{len(COORDS)} — ({lat:.4f}, {lon:.4f})")
        time.sleep(2)

    print(f"✅ Cycle {cycle_number} terminé — Arrivée Amiens !")

if __name__ == '__main__':
    cycle = 1
    print("🚀 Script démarré — boucle infinie Paris → Amiens")
    while True:
        run_cycle(cycle)
        cycle += 1
        print("⏳ Pause 5 secondes avant le prochain cycle...")
        time.sleep(5)