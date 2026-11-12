# FitnessMy Hermes bridge

The bridge runs on the PC that hosts Hermes. It claims meal recommendation jobs over outbound HTTPS, calls the local Hermes API, and returns the result to FitnessMy.

1. Configure a dedicated Hermes profile named `fitnessmy` with the approved provider. Keep its API toolsets empty, disable agent memory, and bind the HTTP listener to `127.0.0.1`. In a multiplexed Hermes installation, enable the loopback listener on the host gateway and use the named profile path. Give that profile its own API server key.
2. In FitnessMy, open Food → Daily menu → Hermes connection. Create a bridge key after reviewing the fields sent for recommendations. The key is shown once. Disconnect in the same panel to revoke it and remove pending jobs.
3. Supply `FITNESSMY_BRIDGE_KEY` and `FITNESSMY_HERMES_KEY` through the local process environment. Start `node scripts/hermes-meal-bridge.mjs` with Node 22 or later. Set `FITNESSMY_ORIGIN` to the staging origin for a staging key. Set `FITNESSMY_HERMES_URL` if the local profile uses a different loopback path. Defaults are the production origin and `http://127.0.0.1:8643/p/fitnessmy/`.
4. Open Today or Food and log a test meal. The calculated plan is available immediately. The model may choose among the offered options. FitnessMy recomputes the displayed totals and requires confirmation before logging a portion.

Keep bridge keys out of Git, browser history and logs. The runner checks the reported Hermes API toolsets before inference. It uses a local in-process cap of 60 model requests per UTC day, with bounded poll intervals, leases and retries. Model recommendations pause when the bridge, Hermes or its provider is unavailable. The diary and calculated plan remain available.
