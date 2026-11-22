#!/usr/bin/env node
/**
 * SchemaFlow Stepped Stress-Test Runner
 * ============================================================================
 * Safe, progressive 3-stage load testing tool for evaluating deployments
 * on resource-constrained environments (e.g., 512 MB RAM / 0.1 CPU on Render).
 *
 * Evaluates:
 *   - Warmup & cold-start check
 *   - Stage 1: Baseline load (10 concurrent workers)
 *   - Stage 2: Moderate load (25 concurrent workers)
 *   - Stage 3: Ceiling / Spike load (50 concurrent workers)
 *
 * Metrics captured:
 *   - Total requests, successful 2xx, non-2xx, timeouts/errors, error rate %
 *   - Realized throughput (req/sec)
 *   - Latency percentiles: p50, p95, p99, and max (ms)
 *   - Initial vs post-test memory change (if testing /health)
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// ----------------------------------------------------------------------------
// CLI & Configuration Parsing
// ----------------------------------------------------------------------------

function cleanUrl(input) {
  if (!input) return '';
  let str = input.trim();
  // Extract URL from markdown link syntax if present: [Label](https://...)
  const mdMatch = str.match(/\((https?:\/\/[^\s\)]+)\)/i);
  if (mdMatch) {
    str = mdMatch[1];
  }
  return str.replace(/\/+$/, '');
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const config = {
    targetUrl: cleanUrl(process.env.TARGET_URL || ''),
    path: '/health',
    method: 'GET',
    body: null,
    logFile: process.env.LOG_FILE || 'stress-results.log',
    quick: false,
    duration: null,
    timeoutMs: 10_000,
    stages: [10, 25, 50],
    cooldownSec: 5,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else if (arg === '--quick' || arg === '-q') {
      config.quick = true;
    } else if ((arg === '--url' || arg === '-u') && argv[i + 1]) {
      config.targetUrl = cleanUrl(argv[++i]);
    } else if ((arg === '--path' || arg === '-p') && argv[i + 1]) {
      config.path = argv[++i];
      if (!config.path.startsWith('/')) config.path = '/' + config.path;
    } else if ((arg === '--method' || arg === '-m') && argv[i + 1]) {
      config.method = argv[++i].toUpperCase();
    } else if ((arg === '--body' || arg === '-b') && argv[i + 1]) {
      config.body = argv[++i];
    } else if ((arg === '--log' || arg === '-l') && argv[i + 1]) {
      config.logFile = argv[++i];
    } else if ((arg === '--duration' || arg === '-d') && argv[i + 1]) {
      config.duration = Number.parseInt(argv[++i], 10);
    } else if (arg === '--stages' && argv[i + 1]) {
      config.stages = argv[++i]
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    } else if (arg === '--timeout' && argv[i + 1]) {
      config.timeoutMs = Number.parseInt(argv[++i], 10);
    } else if (!arg.startsWith('-') && !config.targetUrl) {
      config.targetUrl = cleanUrl(arg);
    }
  }

  // Quick mode presets (for rapid dry runs and local checks)
  if (config.quick) {
    config.stageDurations = [5, 5, 5]; // 5s per stage
    config.cooldownSec = 2;
  } else if (config.duration) {
    config.stageDurations = [config.duration, config.duration, config.duration];
  } else {
    // Default progressive stage durations
    config.stageDurations = [30, 45, 30]; // 30s baseline, 45s moderate, 30s ceiling
  }

  if (!config.targetUrl) {
    config.targetUrl = 'http://localhost:3000';
  }

  return config;
}

function showHelp() {
  console.log(`
SchemaFlow Stepped Stress-Test Runner
Usage:
  node scripts/stress-test.mjs [targetUrl] [options]
  npm run stress -- [targetUrl] [options]

Examples:
  # Test deployed Render instance (default /health)
  node scripts/stress-test.mjs https://schemaflow-30t1.onrender.com

  # Fast 15s dry-run on local or remote server
  npm run stress -- http://localhost:3000 --quick

  # Test custom POST endpoint with JSON body
  node scripts/stress-test.mjs http://localhost:3000 --path /api/health --method GET --log custom.log

Options:
  --url, -u <url>        Target base URL (default: TARGET_URL env or http://localhost:3000)
  --path, -p <path>      Endpoint path to hit (default: /health)
  --method, -m <method>  HTTP method (default: GET)
  --body, -b <payload>   Request payload for POST/PUT requests
  --quick, -q            Quick test mode (5s per stage, 2s cooldown)
  --duration, -d <sec>   Uniform duration in seconds for each stage
  --stages <c1,c2,c3>    Concurrency levels per stage (default: 10,25,50)
  --log, -l <file>       Log file output (default: stress-results.log, pass 'none' to disable)
  --timeout <ms>         Per-request timeout in milliseconds (default: 10000)
  --help, -h             Show this help screen
`);
}

// ----------------------------------------------------------------------------
// Logging & Output Utilities
// ----------------------------------------------------------------------------

class Logger {
  constructor(logFilePath) {
    this.logFile = logFilePath && logFilePath.toLowerCase() !== 'none' ? logFilePath : null;
    if (this.logFile) {
      try {
        fs.mkdirSync(path.dirname(path.resolve(this.logFile)), { recursive: true });
        fs.writeFileSync(this.logFile, `=== SchemaFlow Stress Test Log - ${new Date().toISOString()} ===\n\n`);
      } catch (err) {
        console.warn(`[WARN] Could not initialize log file ${this.logFile}:`, err.message);
        this.logFile = null;
      }
    }
  }

  log(message = '') {
    console.log(message);
    if (this.logFile) {
      // Strip ANSI escape codes when writing to log file
      const plain = message.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
      fs.appendFileSync(this.logFile, plain + '\n');
    }
  }

  rawLog(plainMessage) {
    if (this.logFile) {
      fs.appendFileSync(this.logFile, plainMessage + '\n');
    }
  }
}

// ----------------------------------------------------------------------------
// Statistics Computation
// ----------------------------------------------------------------------------

function calculatePercentile(sortedValues, percentile) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function computeMetrics(results, elapsedSec) {
  const total = results.length;
  let success2xx = 0;
  let non2xx = 0;
  let errors = 0;
  const latencies = [];

  for (const r of results) {
    if (r.error) {
      errors++;
    } else if (r.status >= 200 && r.status < 300) {
      success2xx++;
      latencies.push(r.latencyMs);
    } else {
      non2xx++;
      latencies.push(r.latencyMs);
    }
  }

  latencies.sort((a, b) => a - b);

  const errorCount = errors + non2xx;
  const errorRate = total > 0 ? (errorCount / total) * 100 : 0;
  const throughput = elapsedSec > 0 ? total / elapsedSec : 0;

  return {
    total,
    success2xx,
    non2xx,
    errors,
    errorCount,
    errorRate: Math.round(errorRate * 10) / 10,
    throughput: Math.round(throughput * 10) / 10,
    p50: Math.round(calculatePercentile(latencies, 50) * 10) / 10,
    p95: Math.round(calculatePercentile(latencies, 95) * 10) / 10,
    p99: Math.round(calculatePercentile(latencies, 99) * 10) / 10,
    max: latencies.length > 0 ? Math.round(latencies[latencies.length - 1] * 10) / 10 : 0,
    min: latencies.length > 0 ? Math.round(latencies[0] * 10) / 10 : 0,
    avg:
      latencies.length > 0
        ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10
        : 0,
  };
}

// ----------------------------------------------------------------------------
// HTTP Worker Loop
// ----------------------------------------------------------------------------

async function executeRequest(fullUrl, method, body, timeoutMs) {
  const headers = {
    'User-Agent': 'SchemaFlow-StressRunner/1.0',
    Accept: 'application/json, text/plain, */*',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: body || undefined,
      signal: controller.signal,
    });
    // Consume body stream so socket can be returned to pool
    await res.text();
    const latencyMs = performance.now() - start;
    return {
      status: res.status,
      latencyMs,
      error: null,
    };
  } catch (err) {
    const latencyMs = performance.now() - start;
    const isTimeout = err.name === 'AbortError' || err.code === 20;
    return {
      status: 0,
      latencyMs,
      error: isTimeout ? 'TIMEOUT' : (err.message || 'NET_ERROR'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runStage(stageNum, name, concurrency, durationSec, fullUrl, method, body, timeoutMs, logger) {
  logger.log(`\n----------------------------------------------------------------------------`);
  logger.log(`🚀 [Stage ${stageNum}/3] ${name}`);
  logger.log(`   Target:      ${fullUrl} (${method})`);
  logger.log(`   Concurrency: ${concurrency} parallel workers`);
  logger.log(`   Duration:    ${durationSec} seconds`);
  logger.log(`----------------------------------------------------------------------------`);

  const results = [];
  const stopTime = performance.now() + durationSec * 1000;
  const startTime = performance.now();
  let activeWorkers = 0;

  // Worker task: executes requests back-to-back until duration expires
  async function worker() {
    activeWorkers++;
    while (performance.now() < stopTime) {
      const res = await executeRequest(fullUrl, method, body, timeoutMs);
      results.push(res);
    }
    activeWorkers--;
  }

  // Launch parallel worker group
  const workerPromises = Array.from({ length: concurrency }, () => worker());

  // Progress ticker every second
  const ticker = setInterval(() => {
    const elapsed = Math.round((performance.now() - startTime) / 1000);
    const count = results.length;
    const errs = results.filter((r) => r.error || r.status < 200 || r.status >= 300).length;
    process.stdout.write(
      `   ⏳ Running: ${elapsed}s / ${durationSec}s | Req: ${count} | Err: ${errs} | Active: ${activeWorkers}\r`
    );
  }, 1000);

  await Promise.all(workerPromises);
  clearInterval(ticker);
  process.stdout.write('                                                                               \r');

  const actualElapsedSec = (performance.now() - startTime) / 1000;
  const metrics = computeMetrics(results, actualElapsedSec);

  logger.log(
    `   ✓ Completed: ${metrics.total} reqs in ${actualElapsedSec.toFixed(1)}s (${metrics.throughput} req/s)`
  );
  logger.log(
    `   ✓ Latency:   p50: ${metrics.p50}ms | p95: ${metrics.p95}ms | p99: ${metrics.p99}ms | max: ${metrics.max}ms`
  );
  logger.log(
    `   ✓ Health:    2xx: ${metrics.success2xx} | Errors/Non-2xx: ${metrics.errorCount} (${metrics.errorRate}% error rate)`
  );

  return {
    stageNum,
    name,
    concurrency,
    durationSec: Math.round(actualElapsedSec),
    ...metrics,
  };
}

async function sleep(sec) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

// ----------------------------------------------------------------------------
// Warmup & Memory Inspection
// ----------------------------------------------------------------------------

async function fetchHealthStats(fullUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(fullUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Main Orchestration
// ----------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    process.exit(0);
  }

  const logger = new Logger(config.logFile);
  const fullUrl = `${config.targetUrl}${config.path}`;

  logger.log(`============================================================================`);
  logger.log(`⚡ SchemaFlow Stepped Stress-Test Runner`);
  logger.log(`============================================================================`);
  logger.log(`Target URL:   ${fullUrl}`);
  logger.log(`Method:       ${config.method}`);
  logger.log(`Mode:         ${config.quick ? 'QUICK (5s/stage)' : 'STANDARD'}`);
  logger.log(`Stages:       ${config.stages.join(' → ')} concurrent workers`);
  logger.log(`Stage Time:   ${config.stageDurations.join('s, ')}s`);
  logger.log(`Cooldown:     ${config.cooldownSec}s between stages`);
  logger.log(`Log File:     ${config.logFile || '(disabled)'}`);
  logger.log(`Start Time:   ${new Date().toLocaleString()}`);

  // 1. Warmup Ping
  logger.log(`\n[Warmup] Pinging ${fullUrl} to warm up connection pool & eliminate cold start...`);
  const warmupStart = performance.now();
  const warmupRes = await executeRequest(fullUrl, config.method, config.body, config.timeoutMs);

  if (warmupRes.error) {
    logger.log(`❌ Warmup FAILED: ${warmupRes.error}`);
    logger.log(`   Unable to reach target. Please verify target URL is running and accessible.`);
    process.exit(1);
  }

  logger.log(`✓ Warmup successful (HTTP ${warmupRes.status} in ${warmupRes.latencyMs.toFixed(1)}ms)`);

  // Optional: Check baseline memory if hitting /health
  const initialHealth = await fetchHealthStats(`${config.targetUrl}/health`);
  if (initialHealth?.memoryMb) {
    const m = initialHealth.memoryMb;
    logger.log(`   Baseline Server Memory: RSS: ${m.rss} MB | HeapUsed: ${m.heapUsed} MB | HeapTotal: ${m.heapTotal} MB`);
  }

  // 2. Execute Progressive Stages
  const stageDefinitions = [
    { num: 1, name: 'Baseline Load', concurrency: config.stages[0], duration: config.stageDurations[0] },
    { num: 2, name: 'Moderate Load', concurrency: config.stages[1], duration: config.stageDurations[1] },
    { num: 3, name: 'Ceiling / Spike Load', concurrency: config.stages[2], duration: config.stageDurations[2] },
  ];

  const stageSummaries = [];

  for (let i = 0; i < stageDefinitions.length; i++) {
    const s = stageDefinitions[i];

    if (i > 0 && config.cooldownSec > 0) {
      logger.log(`\n⏸️  Cooldown: Pausing ${config.cooldownSec}s to let CPU & memory stabilize...`);
      await sleep(config.cooldownSec);
    }

    const summary = await runStage(
      s.num,
      s.name,
      s.concurrency,
      s.duration,
      fullUrl,
      config.method,
      config.body,
      config.timeoutMs,
      logger
    );
    stageSummaries.push(summary);
  }

  // 3. Post-Test Server Inspection
  await sleep(2);
  const finalHealth = await fetchHealthStats(`${config.targetUrl}/health`);

  // 4. Print Summary Performance Table
  logger.log(`\n============================================================================`);
  logger.log(`📊 PERFORMANCE SUMMARY TABLE`);
  logger.log(`============================================================================`);

  const headers = ['Stage', 'Workers', 'Duration', 'Requests', 'Req/Sec', '2xx', 'Errors', 'Err %', 'p50', 'p95', 'p99', 'Max'];
  const rows = stageSummaries.map((s) => [
    `Stage ${s.stageNum}`,
    String(s.concurrency),
    `${s.durationSec}s`,
    String(s.total),
    String(s.throughput),
    String(s.success2xx),
    String(s.errorCount),
    `${s.errorRate}%`,
    `${s.p50}ms`,
    `${s.p95}ms`,
    `${s.p99}ms`,
    `${s.max}ms`,
  ]);

  // Compute column widths
  const colWidths = headers.map((h, i) => {
    const maxVal = Math.max(...rows.map((r) => r[i].length), h.length);
    return maxVal + 2;
  });

  const formatRow = (cols) => cols.map((c, i) => c.padEnd(colWidths[i])).join('| ');
  const divider = colWidths.map((w) => '-'.repeat(w)).join('+-');

  logger.log(formatRow(headers));
  logger.log(divider);
  for (const row of rows) {
    logger.log(formatRow(row));
  }
  logger.log(divider);

  // 5. Memory Drift & Server Health Delta
  if (initialHealth?.memoryMb && finalHealth?.memoryMb) {
    const im = initialHealth.memoryMb;
    const fm = finalHealth.memoryMb;
    const rssDiff = (fm.rss - im.rss).toFixed(1);
    const heapDiff = (fm.heapUsed - im.heapUsed).toFixed(1);

    logger.log(`\n🧠 Server Memory Delta:`);
    logger.log(`   - RSS:      ${im.rss} MB → ${fm.rss} MB (${rssDiff >= 0 ? '+' : ''}${rssDiff} MB)`);
    logger.log(`   - HeapUsed: ${im.heapUsed} MB → ${fm.heapUsed} MB (${heapDiff >= 0 ? '+' : ''}${heapDiff} MB)`);
    logger.log(`   - HeapTotal: ${fm.heapTotal} MB | ArrayBuffers: ${fm.arrayBuffers} MB`);
  }

  // 6. Hosting Environment Diagnostic Guide (512 MB RAM / 0.1 CPU)
  logger.log(`\n============================================================================`);
  logger.log(`🔍 RENDER HOSTING ENVIRONMENT METRICS GUIDE (512 MB RAM / 0.1 CPU)`);
  logger.log(`============================================================================`);
  logger.log(`Compare these results against your Render Dashboard (Metrics & Logs tabs):`);
  logger.log(`  1. CPU Throttling:`);
  logger.log(`     - Under 0.1 CPU (~100 millicores), Stage 2 & 3 will cause latency queueing.`);
  logger.log(`     - If p95 latency stays under 500ms at Stage 2, your server handles concurrency safely.`);
  logger.log(`  2. Memory Cap (512 MB):`);
  logger.log(`     - If Render metrics approach >420 MB (80%), watch for OOM restarts (Exit Code 137).`);
  logger.log(`     - Stable RSS delta (no runaway memory growth) confirms no socket or buffer leaks.`);
  logger.log(`  3. Connection Pool:`);
  logger.log(`     - If Error % > 0% in Stage 3, check Render logs for 'ECONNRESET' or 504 Gateway Timeouts.`);
  logger.log(`============================================================================\n`);

  if (config.logFile) {
    logger.log(`📁 Complete results saved to: ${path.resolve(config.logFile)}\n`);
  }
}

main().catch((err) => {
  console.error('Fatal error running stress test:', err);
  process.exit(1);
});
