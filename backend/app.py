from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd
import os

app = Flask(__name__)
CORS(app)

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
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)