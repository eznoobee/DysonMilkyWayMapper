# Live fetch of lit-star data — what's needed to finish it

The planner can already display lit stars from an in-game **F10 occupied
dump** (`docs/plugin/MilkyWayDumpPlugin.cs`). The optional live-fetch script
(`scripts/fetch-milkyway.mjs`) will additionally refresh power / engineer
stats without launching the game — but its login step needs information we
don't have yet.

## Why it's blocked

From the decompiled game we know:

- galaxy server: `http://8.140.162.132/`
- the full data blob is fetched with `GET {server}download/{fullDataUrl}`
- `fullDataUrl` comes **from the login response**, and the login request
  format (path, headers, body, any signing) is not in our notes.

A browser page can never call this server directly (no CORS headers), which
is why this is a node script.

## What to capture (either option works)

### Option A — decompiled source (easiest for you)

In your decompiled `Assembly-CSharp.dll`, find the class that uses
`galaxyServerAddress` (same one that builds the `download/` URL — likely
named something like `MilkyWayDataManager` / `GalaxyServerClient`). Copy the
method(s) that perform the **login/handshake** and paste them into a chat
message or an issue. That's enough to implement `login()` in the script.

### Option B — capture the HTTP exchange

1. Install [Fiddler Classic](https://www.telerik.com/fiddler) or mitmproxy.
2. Start capturing, launch DSP, open the in-game **Milky Way** screen.
3. Find the requests to `8.140.162.132` — there should be a login/auth
   request followed by a `GET /download/...`.
4. Export both requests (method, full URL, headers, body) and share them.
   Redact nothing except your player token *value* (keep its field name).

## Once implemented

```bash
node scripts/fetch-milkyway.mjs          # writes milkyway_occupied.bin
```

Drag the file into the planner. Stats (power, engineers) update for stars the
app can place; clusters whose positions aren't known yet (they only exist
inside Unity's Perlin noise) are counted as "without position" until your
next in-game F10 dump.

## Important limitation

The blob contains `seedKey + power + engineers` — **no positions**. Positions
can only come from the game itself, so the F10 dump remains the primary
source; the live fetch is a stats refresher between game sessions.
