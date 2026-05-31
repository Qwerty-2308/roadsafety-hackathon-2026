import streamlit as st
import pandas as pd
import joblib
import folium
from streamlit_folium import st_folium

# Configure Streamlit page
st.set_page_config(
    page_title="RoadSoS - Emergency Response System",
    page_icon="🚨",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better UI
st.markdown("""
<style>
    .reportview-container .main .block-container{
        padding-top: 2rem;
    }
    .stButton>button {
        width: 100%;
        border-radius: 5px;
        font-weight: bold;
    }
    .sos-button>button {
        background-color: #ff4b4b !important;
        color: white !important;
        height: 60px;
        font-size: 24px !important;
    }
</style>
""", unsafe_allow_html=True)

# Load the trained AI model
@st.cache_resource
def load_model():
    try:
        return joblib.load('model.joblib')
    except Exception as e:
        st.error(f"Error loading model: {e}")
        return None

model = load_model()

# Mock Data for Emergency Services around IIT Madras, Chennai (12.9915, 80.2337)
hospitals = [
    {"name": "Apollo Specialty Hospital (Mock)", "lat": 12.9950, "lon": 80.2300, "type": "Hospital"},
    {"name": "Fortis Malar Hospital (Mock)", "lat": 12.9850, "lon": 80.2400, "type": "Hospital"},
    {"name": "VHS Hospital (Mock)", "lat": 12.9900, "lon": 80.2250, "type": "Hospital"}
]

police_stations = [
    {"name": "Guindy Police Station (Mock)", "lat": 12.9920, "lon": 80.2350, "type": "Police Station"},
    {"name": "Taramani Police Station (Mock)", "lat": 12.9880, "lon": 80.2300, "type": "Police Station"}
]

# --- Sidebar: Input Telemetry ---
st.sidebar.header("Crash Telemetry Inputs")
st.sidebar.markdown("Simulate sensor data from the vehicle.")

speed = st.sidebar.slider("Vehicle Speed (km/h)", min_value=0, max_value=200, value=60, step=5)
impact_force = st.sidebar.slider("Impact Force", min_value=0, max_value=150, value=40, step=1)
airbag_status = st.sidebar.radio("Airbag Deployed?", options=["No", "Yes"])
airbag_val = 1 if airbag_status == "Yes" else 0
vehicle_age = st.sidebar.slider("Vehicle Age (Years)", min_value=0, max_value=30, value=5, step=1)

# --- Main App ---
st.title("🚨 RoadSoS: AI-Powered Emergency Response")
st.markdown("Immediate response coordination based on real-time crash telemetry.")

col1, col2 = st.columns([1, 2])

with col1:
    st.subheader("Accident Analysis")

    # Predict Severity
    prediction = "Unknown"
    if model:
        input_data = pd.DataFrame({
            'speed': [speed],
            'impact_force': [impact_force],
            'airbag_status': [airbag_val],
            'vehicle_age': [vehicle_age]
        })
        prediction = model.predict(input_data)[0]

        # Determine color based on severity
        color_map = {
            "Low": "green",
            "Medium": "orange",
            "High": "red",
            "Critical": "darkred"
        }
        color = color_map.get(prediction, "black")

        st.markdown(f"### Predicted Severity: <span style='color:{color}'>{prediction}</span>", unsafe_allow_html=True)

        if prediction in ["High", "Critical"]:
            st.warning("High severity detected! Emergency services should be dispatched immediately.")
        else:
            st.info("Severity is manageable. Recommend checking on passengers.")
    else:
        st.error("AI Model could not be loaded. Showing default manual mode.")

    st.markdown("---")
    st.subheader("Emergency Action")
    st.markdown('<div class="sos-button">', unsafe_allow_html=True)
    if st.button("🔴 TRIGGER SOS ALERT"):
        st.success(f"SOS Alert Sent! Severity: {prediction}. Dispatching nearest emergency units...")
    st.markdown('</div>', unsafe_allow_html=True)

with col2:
    st.subheader("Nearest Emergency Services (IIT Madras Region)")

    # Map center (IIT Madras)
    map_center = [12.9915, 80.2337]
    m = folium.Map(location=map_center, zoom_start=14)

    # Add accident location marker
    folium.Marker(
        location=map_center,
        popup="Accident Location",
        icon=folium.Icon(color="red", icon="info-sign")
    ).add_to(m)

    # Add hospitals to map
    for h in hospitals:
        folium.Marker(
            location=[h["lat"], h["lon"]],
            popup=h["name"],
            tooltip=h["name"],
            icon=folium.Icon(color="blue", icon="plus", prefix="fa")
        ).add_to(m)

    # Add police stations to map
    for p in police_stations:
        folium.Marker(
            location=[p["lat"], p["lon"]],
            popup=p["name"],
            tooltip=p["name"],
            icon=folium.Icon(color="darkblue", icon="shield", prefix="fa")
        ).add_to(m)

    # Render map
    st_folium(m, width=700, height=500)

st.markdown("---")
st.markdown("*RoadSoS Hackathon Prototype - Built with Streamlit & Folium*")
