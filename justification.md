# Vehicle Analytics Fullstack Assessment – Justification

## API

Use this file to briefly explain your design decisions. Bullet points are fine.

### 1. Overall API design

- Summary of your API structure and main routes (paths, methods, and what they return):

- API routes implemented:
- `GET /health`: checks whether the API can reach the emulator and returns `{ status, emulator }`.
- `GET /sensors`: returns metadata list `[{ sensorId, sensorName, unit }]` from emulator metadata.
- `GET /telemetry/latest`: returns latest valid reading per sensor `[{ sensorId, value, timestamp }]`; this data is sanitized and cached.
- `GET /telemetry/stats`: returns ingestion counters `{ accepted, dropped, coerced }`.
- API is connected to an emulator WebSocket, validates incoming payloads, and stores latest per sensor in memory (`Map<sensorId, reading>`). This is later used to display sensor data on the website.

### 2. Data vs metadata separation
- How clients should use your metadata route(s) vs your data route(s) (and streaming, if implemented):

Clients can call `/sensors` to fetch metadata that refreshes based on emulator metadata. The data route (`/telemetry/latest`) stores recent valid readings so they can be displayed on the dashboard and used as a live state metric of the car. This is polled quite frequently. Data is validated before use, so malformed/garbage payloads are cleaned up already.
Workaround choices were all implemented in API only (validation, coercion, dropping malformed payloads, out-of-range detection, caching).

### 3. Emulator (read-only)
- Confirm you did not modify the emulator service (`emulator/`) or its `sensor-config.json`. If you needed to work around anything, note it here: Y


### 4. OpenAPI / Swagger
- Where your final OpenAPI spec lives and how to view or use it (e.g. Swagger UI):

- Final OpenAPI spec is documented in 2 places: `api/openapi.yaml` and `openapi.yaml`.
- Both are exactly the same, and the root one is mirrored from the API one.
- One can view the spec by pasting the YAML into Swagger Editor online (`https://editor.swagger.io/`).

### 5. Testing and error handling
- What you chose to test and any notable error-handling decisions:

- Manual route checks via curl for `/health`, `/sensors`, `/telemetry/latest`, `/telemetry/stats`.
- Runtime verification with emulator running: latest values update, risk notifications appear, out-of-range burst logs trigger.
- Notable error handling:
- Health returns `503` when emulator is not reachable.
- `/sensors` validates payload shape and returns `502` if metadata fetch fails and cache is unavailable.
- Metadata endpoint serves stale cache if emulator temporarily fails.
- Telemetry ingestion does not forward malformed readings to client state.

### 6. Invalid data from the emulator (Task 2)
- How you detect invalid readings from the emulator stream:
- What you do with invalid data (drop, log, count, etc.) and why:

- Payload must be an object with exactly `sensorId`, `value`, `timestamp`. If it is not, it is treated as malformed/garbage data.
- Numeric fields are validated as finite numbers, and numeric strings are checked as well.
- `sensorId` must be a positive safe integer; `timestamp` must be positive.
- These are default checks to determine whether data is malformed, and then ingestion counters handle all cases.
- Unrecoverable invalid payloads are dropped and counted (`dropped`).
- Recoverable numeric-string cases are coerced and counted (`coerced`), then accepted.
- Valid readings are stored as latest and counted (`accepted`).
The ingestion engine exists so we can keep the frontend clean, with data that is valid and data that might still be valid but arrives in a format that can be coerced. This helps keep track of everything and also build the sensor table cleanly.

### 7. Out-of-range values per sensor (Task 3)
- How you use the valid-range table (sensor name or sensorId → min/max) and count out-of-range readings per sensor in a 5-second window:
- How you log the timestamp and error message (including sensor) when a sensor exceeds the threshold (&gt;3 out-of-range in 5 s):


- API defines valid min/max per sensor name exactly per assessment table.
- `sensorId -> sensorName` map is built from `/sensors` metadata; range lookup then uses sensor name.
- Counting logic:
- For each sensor, API keeps a rolling list of out-of-range event timestamps.
- On each valid reading, events older than 5 seconds are pruned; current out-of-range event is appended.
- Alert condition/logging:
- If count in the 5-second window exceeds 3, API logs a console error with current ISO timestamp, `sensorId`, `sensorName`, and count/window metadata.
- A per-sensor active flag prevents repeated spam logs until count drops back to threshold or below, then can alert again on the next burst.


## Frontend

Use this section to briefly explain your frontend design decisions. Bullet points are fine.

### 1. Figma mockup

- Link to your low-fidelity Figma mockup and what it shows:
https://www.figma.com/design/yRtoV94B7bdCEoTAgt6V6l/redback?node-id=0-1&t=fPeMdLJ7MgrwmNub-1

The Figma mockup is a basic wireframe of what I planned to achieve with my UI. Since I had a clear idea of what I wanted to display and how I wanted that, I planned it out quickly over Figma with just texts and containers.
If I was developing exact UI for someone else, I would put more time into exact details.


### 2. Layout and information hierarchy

- Why you structured the dashboard the way you did:
There are basically two main reasons why I designed it this way. First, I wanted everything important to be visible on the initial screen so the dashboard feels clean, easy to navigate, and easy to understand at a glance. The idea was to reduce unnecessary clicks and make sure users can immediately see current health, active risks, and live telemetry. 
Second, I took inspiration from actual F1 dashboards. In real-world race systems, the amount of information is much larger (for example airflow behavior, tire pressures, strategy metrics, and many other layers), for the car but since I didn't have access to a detailed 3D car I could only emulate the tire and the axel. The sensor table shows all of the metrics required for the user to make a deduction on the stability of the car and there is a graph to display that as well. Since the data from this emulator is very diverse and polls in a non linear way, the graph doesn't display anything useful. But in a real world scenario where a car is stable, the graph would be able to depict the instances where instability hits and a user would be able to observe the history of instabilities and warnings easily. The vehicle alerts also show notifications with timeframes and reasoning behind critical risks.

### 3. API consumption

- How you use `/sensors` and `/telemetry` (and WebSocket, if used):
The frontend uses `/sensors` as the reference layer and `/telemetry/latest` as the live layer. First, `/sensors` is fetched so I can map `sensorId` to readable names and units. Then `/telemetry/latest` is polled frequently to update the latest values and timestamps for each sensor. I merge both datasets in the UI, calculate warning/stable state from the latest value, and use that state to drive the sensor table, risk notifications, car highlights, and stability graph behavior. WebSocket is used between emulator and API for ingestion, while the frontend reads only API HTTP endpoints so client-side data flow stays simple and predictable. This also ensures that garbage value from the sensor doesn't go through and frontend displays actual data required.

### 4. Visual design and usability

- Choices around colours, typography, states, and responsiveness:
I wanted to have a neutral tone where errors and the car are the most visible things. This helps with zoning in on the right aspects and seeing data that is necessary to make decisions. The font I used is RedHatMono, and I love this font because it looks simple with a bit of brutalism. The sensor live feed has been made where the signal table is named in a non-cryptic way and thus data is shown in a uniform manner from the cache without making it complex to absorb. This ensures that data we receive is fast, almost instantaneous, polls every second, and shows warning or stability. The time frame is also mentioned so that the client can have an idea of what is going on and when. When you hover over table items, you can see their ID and raw name so that you can go onto a lower level and actually fix the issues which are happening.


### 5. Trade-offs and limitations

- Anything you would do with more time or a different stack:
With more time, I would probably try to have an actual full 3D model workflow for the car (I do not know much about 3D stuff yet), but I downloaded a glb first and then switched to gltf so I could highlight tires and axles. With more time, I would try to maximize what I could do with the car interaction since I am unfamiliar with 3D, but I thought this was a good idea for the dashboard. A limitation I faced is that if the data was even cleaner and had deeper history, the graphs could make more operational sense than they do right now.
