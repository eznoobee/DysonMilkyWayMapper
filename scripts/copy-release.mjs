// Copy the single-file build to the repo root so the app can be used by
// double-clicking dsp-milky-way-planner.html without any toolchain.
import { copyFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dsp-milky-way-planner.html');
console.log('wrote dsp-milky-way-planner.html');
