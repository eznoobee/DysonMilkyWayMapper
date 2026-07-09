// Downloads the galaxy server's occupied-clusters blob to milkyway_occupied.bin
// so the app can refresh lit-star stats (power / engineer counts).
//
// STATUS: the download half works once LOGIN below is filled in. The game's
// login exchange has not been reverse-engineered yet — see docs/live-fetch.md
// for exactly what to capture and where to paste it.
//
// What we know for certain (from the decompiled game):
//   server   = http://8.140.162.132/
//   full blob = GET {server}download/{fullDataUrl}    where fullDataUrl comes
//               from the login response.
//
// Usage: node scripts/fetch-milkyway.mjs [output-file]

import { writeFileSync } from 'node:fs';

const SERVER = 'http://8.140.162.132/';
const OUT = process.argv[2] || 'milkyway_occupied.bin';

// ---------------------------------------------------------------------------
// LOGIN — fill this in from a captured game session (docs/live-fetch.md).
// Must return the `fullDataUrl` string from the login response.
async function login() {
  // Example of what this will roughly look like once captured:
  //   const res = await fetch(SERVER + '<login-path>', {
  //     method: 'POST',
  //     headers: { ... },
  //     body: ...,
  //   });
  //   const payload = await res.<json|text|arrayBuffer>();
  //   return <fullDataUrl extracted from payload>;
  throw new Error(
    'Login flow not captured yet. Follow docs/live-fetch.md to capture the ' +
    "game's login request against " + SERVER + ' and implement login() here.'
  );
}
// ---------------------------------------------------------------------------

const fullDataUrl = await login();
const url = SERVER + 'download/' + fullDataUrl;
console.log('GET', url);
const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${buf.length.toLocaleString()} bytes)`);
console.log('Drag this file into the planner to refresh lit-star stats.');
