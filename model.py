import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
import joblib

def generate_synthetic_data(num_samples=1000):
    np.random.seed(42)

    # Features
    # Speed: 0 to 150 km/h
    speed = np.random.uniform(0, 150, num_samples)

    # Impact force: 0 to 100 (arbitrary unit)
    impact_force = np.random.uniform(0, 100, num_samples)

    # Airbag deployed: 0 or 1
    airbag_status = np.random.randint(0, 2, num_samples)

    # Age of vehicle: 0 to 20 years
    vehicle_age = np.random.uniform(0, 20, num_samples)

    df = pd.DataFrame({
        'speed': speed,
        'impact_force': impact_force,
        'airbag_status': airbag_status,
        'vehicle_age': vehicle_age
    })

    # Target: Severity (0: Low, 1: Medium, 2: High, 3: Critical)
    # Severity is a function of the features with some noise
    severity_score = (speed * 0.4) + (impact_force * 0.5) - (airbag_status * 20) + (vehicle_age * 0.5) + np.random.normal(0, 10, num_samples)

    conditions = [
        (severity_score < 40),
        (severity_score >= 40) & (severity_score < 70),
        (severity_score >= 70) & (severity_score < 100),
        (severity_score >= 100)
    ]
    choices = ['Low', 'Medium', 'High', 'Critical']

    df['severity'] = np.select(conditions, choices, default='Critical')

    return df

def train_and_save_model():
    print("Generating synthetic data...")
    data = generate_synthetic_data(5000)

    X = data[['speed', 'impact_force', 'airbag_status', 'vehicle_age']]
    y = data['severity']

    print("Training Random Forest Classifier...")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X, y)

    print("Saving model to model.joblib...")
    joblib.dump(model, 'model.joblib')
    print("Done!")

if __name__ == "__main__":
    train_and_save_model()
