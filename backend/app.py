from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd
import os
import threading
import time
import random
import numpy as np
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# ─── Génération des données ───

def interpolate(p1, p2, n=14):
    lats = np.linspace(p1[0], p2[0], n)
    lons = np.linspace(p1[1], p2[1], n)
    return list(zip(lats, lons))

KEY_POINTS = [
    (48.8800, 2.3550), (48.9300, 2.3200), (48.9800, 2.2800),
    (49.0300, 2.2450), (49.0800, 2.2150), (49.1300, 2.1950),
    (49.1800, 2.1750), (49.2300, 2.1550), (49.2800, 2.1420),
    (49.3300, 2.1320), (49.3800, 2.1250), (49.4300, 2.1200),
    (49.4800, 2.1150), (49.5300, 2.1080), (49.5800, 2.1000),
    (49.6300, 2.0940), (49.6800, 2.0880), (49.7300, 2.0820),
    (49.7800, 2.0760), (49.8300, 2.0700), (49.8550, 2.0900),
    (49.8750, 2.1500), (49.9000, 2.2958),
]

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

def run_generator():
    cycle = 1
    while True:
        start_time = datetime.now()
        print(f"\n🚂 Cycle {cycle} — Départ ({start_time.strftime('%H:%M:%S')})")
        first_row = generate_row(COORDS[0][0], COORDS[0][1], start_time, 0)
        pd.DataFrame([first_row]).to_csv('data.csv', index=False)
        for i in range(1, len(COORDS)):
            lat, lon = COORDS[i]
            timestamp = start_time + timedelta(seconds=i * 30)
            row = generate_row(lat, lon, timestamp, i)
            df = pd.read_csv('data.csv')
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
            df.to_csv('data.csv', index=False)
            print(f"  Point {i+1}/{len(COORDS)}")
            time.sleep(2)
        print(f"✅ Cycle {cycle} terminé !")
        cycle += 1
        time.sleep(5)

# ─── API Flask ───

def read_data():
    if not os.path.exists('data.csv'):
        return None
    df = pd.read_csv('data.csv')
    if df.empty:
        return None
    return df

@app.route('/')
def index():
    return jsonify({'status': 'ok', 'message': 'Train Tracker API'})

@app.route('/api/position')
def get_position():
    df = read_data()
    if df is None:
        return jsonify({'error': 'Pas encore de données'}), 404
    derniere_ligne = df.iloc[-1]
    return jsonify({
        'latitude':  float(derniere_ligne['CAN-LATITUDE'])  / 1e7,
        'longitude': float(derniere_ligne['CAN-LONGITUDE']) / 1e7,
        'altitude':  float(derniere_ligne['CAN-ALTITUDE'])  / 1e3,
        'date':      str(derniere_ligne['DATE(DD/MM/YY)']),
        'heure':     str(derniere_ligne['TIME(hh:mm:ss)']),
        'rpm':       int(derniere_ligne['CAN-RPM']),
    })

@app.route('/api/positions')
def get_all_positions():
    df = read_data()
    if df is None:
        return jsonify([])
    positions = []
    for _, row in df.iterrows():
        positions.append({
            'latitude':  float(row['CAN-LATITUDE'])  / 1e7,
            'longitude': float(row['CAN-LONGITUDE']) / 1e7,
            'altitude':  float(row['CAN-ALTITUDE'])  / 1e3,
            'date':      str(row['DATE(DD/MM/YY)']),
            'heure':     str(row['TIME(hh:mm:ss)']),
            'rpm':       int(row['CAN-RPM']),
        })
    return jsonify(positions)

if __name__ == '__main__':
    # Lance le générateur dans un thread séparé
    t = threading.Thread(target=run_generator, daemon=True)
    t.start()

    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)