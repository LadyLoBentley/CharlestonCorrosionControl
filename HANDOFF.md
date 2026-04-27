# Charleston Corrosion Control — Handoff & Future Work

This document is for whoever picks up the project next. It explains what's already built, the quirks worth knowing about, and a list of things worth doing — written so you don't have to read the whole codebase first.

---

## 1. What's Already Built

### The stack (what each part is)

- **Frontend** — the website you see in the browser. Built with **React** (a popular JavaScript library for building UIs) and **Vite** (a tool that runs the dev server and bundles the code). The styling is custom CSS — there's no Tailwind, Bootstrap, or other CSS framework. All visual choices live in `frontend/src/index.css`.
- **Backend** — the server the frontend talks to. Built with **FastAPI** (a Python web framework) and **SQLModel** (a tool that lets us describe database tables as Python classes). The data lives in a Postgres database hosted on **Supabase**.
- **Machine learning** — a pre-trained model (saved as a file in `backend/artifacts/`) that takes recent sensor readings and predicts the probability of corrosion. It's loaded into memory once when the server starts.
- **Database tables** — only two right now: `sensors` (the devices) and `sensor_readings` (the measurements they produce).

### Pages in the app

| URL | File | What it does |
| --- | --- | --- |
| `/dashboard` | `pages/dashboard.jsx` | Overview screen — totals, alerts, and recent activity. |
| `/sensors` | `pages/sensors.jsx` | List of all sensors. Search, filter, and click a row to open it. |
| `/sensors/new` | `pages/SensorForm.jsx` | Form for adding a new sensor. |
| `/sensors/:code` | `pages/SensorDetail.jsx` | One sensor's details — view, edit, or delete it. |
| `/locations` | `pages/Locations.jsx` | Locations grouped from the location field on each sensor. |
| `/locations/:name` | `pages/LocationDetail.jsx` | One location — see/rename it, list its sensors, add a new sensor to it. |
| `/activity` | `pages/Activity.jsx` | Predictions for every sensor and trend charts of the readings. |

### What the backend exposes

These are the URLs the frontend calls. You shouldn't need to touch them often.

| Method | URL | Purpose |
| --- | --- | --- |
| GET | `/` | "Is the server up?" |
| GET | `/api/sensor-submissions/` | Get all sensors |
| POST | `/api/sensor-submissions/` | Create a sensor |
| GET | `/api/sensor-submissions/{code}` | Get one sensor |
| PATCH | `/api/sensor-submissions/{code}` | Update some fields on a sensor |
| DELETE | `/api/sensor-submissions/{code}` | Delete a sensor (and all its readings) |
| GET | `/api/locations/{name}` | Get sensors at a location |
| PATCH | `/api/locations/{name}` | Rename a location across all its sensors |
| GET | `/sensor-readings/` | All readings ever |
| POST | `/sensor-readings/` | Add a new reading |
| GET | `/sensor-readings/{code}` | Readings for one sensor |
| GET | `/corrosion/predict/{code}` | Run the ML model on a sensor's latest data |
| GET | `/corrosion/metadata` | Info about the ML model (which inputs it uses, the threshold) |

### Reusable pieces in the frontend

- `components/Icons.jsx` — all the icons used in the app, drawn with code so they scale and color cleanly. No image files needed.
- `components/Card/Card.jsx` — a generic card box used for grouping content.
- `components/LineChart.jsx` — the chart used on the Activity page. Hand-written so we don't depend on a charting library.

### Helper scripts

These live in `backend/scripts/` and exist to put fake data into the database for demos and development.

- `seed_sensors_and_readings.py` — wipes everything and refills it with 8 example sensors and 30 days of fake readings. Run it once when starting fresh.
- `update_sensor_readings.py` — adds new fake readings on top of whatever's already there (does not delete anything). Use this to make the dashboard look "live" without breaking real data. Run with `--once` to add a single fresh reading per sensor.

### Look and feel

- All colors, spacing, and rounded-corner sizes are defined as variables at the top of `index.css`. Change them in one place and the whole app updates.
- Two fonts: **Inter** for normal text, **JetBrains Mono** for sensor codes and numbers in tables.
- Brand color is a purple-to-cyan gradient on the small square in the top-left of the sidebar.

---

## 2. Things to Know Before You Change Stuff

These are issues already in the code. Not bugs you broke — bugs that were there.

1. **`backend/ml/predict.py` runs database code as soon as it's imported.** At the bottom of the file, there are a few lines that call the database directly (not inside a function). That means *every time* something imports this file, including when the API starts up, those lines run. The fix is to wrap them in `if __name__ == "__main__":` (a Python pattern that says "only run this when the file is executed directly").

2. **A small SQL safety issue.** The same file builds a database query by sticking the sensor code straight into a string. That's risky — a cleverly named sensor code could be used to attack the database. Replace it with a "parameterized" query (the database library has a safe way to insert values into queries).

3. **No way to update the database structure safely.** Right now, when the server starts, it creates any missing tables — but if you *change* an existing table (add a column, rename one), nothing happens. Before you change tables that already have real data in them, set up a tool called **Alembic** that records each change so it can be applied to every environment.

4. **Time zones are inconsistent.** Some timestamps in the database are stored with a time zone attached, some aren't. The newer code is careful about this; older code isn't. Always store and read times in UTC (the universal time zone) going forward.

5. **The CORS list is hardcoded for development.** CORS is the rule that says "this website is allowed to call this server." Right now it's set to allow only `localhost:5173`, which is fine for your laptop but not for production. When you deploy, add the real website URL. Better yet, read it from an environment variable.

6. **The `.env` file has real database credentials in it.** It is correctly excluded from Git (it won't get committed by accident), but if anyone has ever seen the file, those credentials are exposed. Change the database password before deploying anywhere public, and look into a "secrets manager" tool for storing credentials safely.

7. **The risk thresholds are copy-pasted in six places.** The numbers `0.85`, `0.6`, and `0.3` (used to label predictions as Critical / High / Medium / Low) appear in six different files. If you ever want to change them, you'd have to find and change all six. Move them to one shared file (something like `frontend/src/config.js`) so there's only one place to edit.

8. **The "Admin / Viewer" button doesn't actually do anything.** It changes a label on screen but doesn't restrict what anyone can do. Real role-based permissions are in the roadmap below.

9. **There's a duplicate, unused CSS file.** `frontend/src/App.css` is a near-copy of `index.css` but nothing imports it. Safe to delete.

10. **The address of the backend (`http://127.0.0.1:8001`) is hardcoded in every page that calls it.** When you deploy, you'd have to find and change all of them. Move it to one place — a small file like `frontend/src/api.js`.

---

## 3. The Roadmap — Your Items, Explained

For each idea: **where things are now**, **what to do**, and **how big a project it is**. Pick one at a time; don't try to start them all together.

### 3.1 Use real sensor data and pick a better prediction model

**Where things are now.** Every reading the app has ever seen came from the fake-data scripts. The current model is something called an **SVM** (a kind of math-based classifier) — it works fine on clean data but breaks if any input is missing.

**What to do.**

- First, get real data flowing in (see 3.5 below for how).
- *Look at the data before you change the model.* Real sensors drop off, give wrong readings, and have clock-skew issues. Build a small page that shows how clean the data is (% of missing values, etc.) before you trust any model trained on it.
- When you're ready to swap the model, try **gradient-boosted trees** (libraries like XGBoost or LightGBM). They handle missing values without help and almost always beat SVMs on this kind of sensor data. **Random Forest** is another easy starting point.
- More complicated approaches (LSTM, neural networks, Prophet) are overkill until you've tried the simpler models and they aren't good enough.
- **Important:** before swapping any model, set up a way to measure whether the new one is actually better than the old one on the same data. Otherwise you're guessing.

**Size.** Big. Realistically two separate projects: (a) get real data in and audit it, (b) compare models with proper evaluation.

### 3.2 Add real user accounts and roles

**Where things are now.** The app has no login. Anyone who opens it can do anything. The "Admin / Viewer" toggle on the dashboard is just a label.

**What to do.**

- Easiest path: use **Supabase Auth** (Supabase, the database host, also offers a built-in login system). It saves you from building login from scratch, which is hard to get right.
- Define the roles. Suggested:
  - **Admin** — can do everything, including managing other users.
  - **Operator** — can create and edit sensors and readings, but can't manage users.
  - **Viewer** — can only look, not change.
- **Backend.** Add a "current user" concept and check the user's role on each protected route.
- **Frontend.** Add a login page. Hide or disable buttons (Delete, Add Sensor, etc.) that the user's role doesn't allow.
- Don't store the login token in the browser's regular storage — it's safer to use a special cookie that JavaScript can't read.

**Size.** Medium-large. Using Supabase Auth roughly halves the work.

### 3.3 Make Locations a real database table

**Where things are now.** A "location" is just a text field on each sensor — there's no separate table for locations. The Locations page works by grouping sensors by their location text.

**What to do.**

- Create a new `Location` table with fields like name, description, building, and (optionally) GPS coordinates.
- Migrate the existing data: for every unique location string in the sensors table, create a Location row. Then change the sensor table so each sensor *links to* a location instead of just naming one.
- Add the usual create/read/update/delete URLs for locations (`/api/locations`).
- Decide what happens when a location with sensors is deleted — block the delete? Or set those sensors to "no location"? Document whichever rule you pick.
- Once this is done, the bulk-rename URL we have today becomes unnecessary.

**Size.** Medium. Be careful with the data migration — you don't want to lose anyone's existing location info.

### 3.4 Account settings page

**Where things are now.** No accounts exist yet, so there are no settings.

**What to do once accounts exist (3.2).**

- **Profile** — name, email, profile photo.
- **Appearance** — light/dark theme, language.
- **Security** — change password, set up two-factor authentication, see and revoke active sessions.
- **Notifications** — choose which alerts get emailed/texted to you.

**Size.** Each individual page is small. The hard part is the login system underneath (3.2).

### 3.5 Connect to real sensors and track GPS

**Where things are now.** Real devices aren't connected to the app at all. All readings come from scripts.

**What to do.**

- Real corrosion sensors usually communicate using one of three protocols: Modbus, MQTT, or HTTPS. Each is a way for a device to send data over a network. Pick one based on the actual hardware.
- The simplest first step: a small Python program that listens for incoming sensor messages and sends them to the existing `/sensor-readings/` URL. That way the rest of the app doesn't need to change.
- For GPS / shipping tracking: add latitude and longitude fields to readings (or a separate table just for GPS pings). Show the path on a map using **Leaflet**, a free mapping library that doesn't require an API key.
- This is especially useful for sensors riding along with cargo (e.g. inside a shipping container) — you can see exactly where the sensor was when it crossed into a risk zone.

**Size.** Depends on the hardware. Start with one sensor on a desk before trying to scale.

### 3.6 Suggest actions to prevent corrosion damage

**Where things are now.** The app shows predictions but doesn't recommend what to do about them.

**What to do.**

- Add a new table called something like `actions` — each row is a suggestion the system has made (e.g. "consider reordering replacement parts", "reroute this shipment to a drier route").
- Write rules that create suggestions automatically. Start tiny: "if a sensor's probability is over 85% three times in a row → suggest an inspection." You can grow from there.
- For estimating remaining life of a material: store a lookup table per material that maps cumulative corrosion (the running total in the readings) to expected lifespan. Display as a gauge on the sensor detail page.
- For shipment rerouting: when a sensor in transit crosses a threshold, send a webhook (an automated message) to a logistics system, or just email an ops contact.
- Each suggestion should have an "acknowledged by user X on date Y" field so there's a record of who saw it.

**Size.** Big. Start with a single rule and a single channel (e.g. just send an email) and build outward.

---

## 4. Other Ideas Worth Doing

Roughly ordered by quickest-wins-first.

### Quick wins (a few hours each)

- **Save predictions over time.** Right now, predictions are calculated on demand and never saved. If you save them in a new `predictions` table, you can chart probability *over time* per sensor — a major Activity-page upgrade. Also a prerequisite for measuring whether a new model is better than the old one.
- **Export to spreadsheet.** Add "Download CSV" buttons on the Sensors / Readings / Predictions pages.
- **Better notifications.** Replace the browser's `alert()` popups with toast messages (small notifications that slide in from a corner). Libraries like `react-hot-toast` make this easy.
- **Keyboard shortcuts.** Things like pressing `g` then `s` to jump to the Sensors page, or `/` to focus the search bar.
- **Real "page not found" page.** Right now, an unknown URL just sends you to the dashboard, which makes broken links hard to notice.
- **Move the risk thresholds to one file.** As mentioned in section 2, they're copy-pasted in six files.
- **Delete `App.css`.** It's an old duplicate.

### Medium projects (one to two weeks)

- **Map view.** Show all locations on a map (using Leaflet, free). Pairs naturally with 3.5 above.
- **Compare two sensors side by side.** Pick a few sensors, overlay their trends on one chart. The chart component already supports multiple lines.
- **Data quality dashboard.** Pure read-only page showing how many readings each sensor missed in the last 24 hours, how many failed validation, when the longest gap was, etc.
- **Alerts.** Send an email or Slack message when a sensor's probability gets dangerously high.
- **Audit log.** A page listing "who changed what, when." Needs accounts to exist (3.2 above).
- **Pagination.** Once you have thousands of sensors or readings, the lists will feel slow. Splitting them into pages helps.
- **Dark mode.** The CSS is already structured for it — flip the variables and add a toggle.
- **Make it work nicely on phones / installable.** The layout already shrinks; adding a few extra files makes it installable like a real app on iOS and Android.

### Bigger projects

- **Automated tests for the backend.** A test suite that runs every time you make a change and tells you if you broke something. The `tests/` folder exists but has almost nothing in it.
- **Database migrations (Alembic).** Required before you can safely change existing tables in production.
- **Continuous integration.** Set up GitHub Actions so every code change automatically gets checked.
- **API rate limiting.** Once real devices send data, you'll want to prevent any one device from flooding the server.
- **Multi-tenancy.** If Charleston Corrosion sells this product to multiple customers, you'll need to make sure each customer only sees their own data.
- **Translations.** If you want to support languages other than English, set this up early — retrofitting translations later is painful.
- **Accessibility audit.** Make sure the app works with screen readers and keyboard-only navigation. Tools like axe DevTools find most issues automatically.

### Things to *not* spend time on

- **Don't build your own charting library.** The one we have works. Only swap to something fancier (like Recharts) if you genuinely need features it doesn't have.
- **Don't build your own login system from scratch** if a service like Supabase Auth fits. Login is one of the easiest places to introduce a security problem.
- **Don't break the app into many small services.** "Microservices" are popular but are the wrong choice for an app this size. Keep everything in one codebase until the team is at least five people working full-time on it.

---

## 5. Setting Up the Project

```bash
# Backend (the API server)
cd backend
python -m venv .venv                        # create a fresh Python environment
source .venv/bin/activate                   # activate it (different on Windows)
pip install -r requirements.txt             # install dependencies
# Make sure backend/.env has DATABASE_URL pointing to the right database.
uvicorn main:app --reload --port 8001       # start the server

# Fill the database with example data (only do this once when starting fresh)
python -m scripts.seed_sensors_and_readings

# Refresh the example data anytime (does not delete anything)
python -m scripts.update_sensor_readings --once
# Or run continuously, simulating live sensors:
while true; do python -m scripts.update_sensor_readings --once; sleep 60; done

# Frontend (in a second terminal window)
cd frontend
npm install
npm run dev
# Then open http://localhost:5173 in your browser
```

Tested with **Python 3.14** (inside the venv) and **Node 22**.

**Common issue:** if you see an error mentioning `ModuleNotFoundError: db` or weird old-Python syntax errors pointing at `~/Library/Python/3.9/site-packages/db/...`, it means you're accidentally running with the wrong Python. Fix: run `source backend/.venv/bin/activate` first, and run scripts from the `backend/` folder using `python -m scripts.<name>`.

---

## 6. Glossary

For when an unfamiliar term shows up.

- **API** — the set of URLs the backend exposes for the frontend (or any other program) to call.
- **Backend** — the Python server that handles requests, talks to the database, and runs the ML model.
- **Cumulative corrosion** — the running total of how much material has corroded since the sensor started reporting. The seed scripts produce two of these: one for copper, one for silver.
- **Database migration** — a saved record of a change to the database structure, so the same change can be replayed in production.
- **Frontend** — the React app that runs in the browser.
- **ISA class** — an industry classification (G1, G2, G3, GX) for how corrosive an environment is. The seed scripts assign these based on the readings they generate.
- **JWT / token** — a short string the server gives a logged-in user, which the user includes on every future request to prove they're still logged in.
- **MQTT** — a simple messaging protocol that small IoT devices commonly use to publish their readings.
- **Prediction** — the ML model's guess for whether a sensor's location is currently corroding, expressed as a probability between 0 and 1.
- **Reading** — one measurement from a sensor at one moment in time (temperature, humidity, pressure, etc.).
- **Risk bucket** — the human-readable label (Critical, High, Medium, Low) we put on a probability for display purposes.
- **SVM** — "Support Vector Machine," the type of ML model currently in use. Works well on small, clean datasets; struggles with missing values.
- **Threshold** — the cutoff probability above which the model says "yes, this is corroding." Currently set to whatever the model file says (around 0.08).

---

Good luck. The MVP is a solid foundation — the most valuable next step is real data and real users.
