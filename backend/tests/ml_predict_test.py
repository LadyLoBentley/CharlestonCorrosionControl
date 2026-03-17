import pandas as pd
from db.database import engine
from ml.predict import prepare_sensor_data

query = """
    SELECT *
    FROM sensor_readings
    ORDER BY timestamp DESC
    LIMIT 20
"""

df = pd.read_sql(query, engine)

# important: sort oldest → newest before lag creation
df = df.sort_values("timestamp")

prepared = prepare_sensor_data(df)

print(prepared.head())
print(prepared.columns.tolist())