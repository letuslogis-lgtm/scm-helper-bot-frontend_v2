// ============================================================
// 📌 LetusLogis Local RPA Worker (v1)
// ============================================================
// 사용자 PC 에 24/7 떠있는 Node 프로세스.
//
// 책임:
//   1. rpa_jobs 의 runner_type='local' AND enabled=true 봇들을
//      cron 표현식에 따라 자동 실행
//   2. rpa_runs 에 status='pending' 인 row 가 INSERT 되면
//      즉시 실행 (메뉴의 "지금 실행" 버튼)
//   3. rpa_jobs 가 변경되면 cron 등록 갱신
//
// 실행:
//   npm run worker
//   또는
//   node scripts/worker.mjs
//
// 종료:
//   Ctrl+C (SIGINT)
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// ------------------------------------------------------------
// 0. 경로 + 환경변수
// ------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// ── Slack 알림 헬퍼 (notify-slack Edge Function 호출) ─────────
async function notifySlack({ email, title, message }) {
    try {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-slack`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, title, message }),
        });
    } catch (err) {
        warn(`[notifySlack] 호출 실패 (무시): ${err.message}`);
    }
}

// WMS 이벤트 Edge Function 호출 헬퍼
async function notifyWmsEvent(event, extra = {}) {
    try {
        await fetch(`${SUPABASE_URL}/functions/v1/on-wms-event`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ event, ...extra }),
        });
        log(`[notifyWmsEvent] ${event} 호출 완료`);
    } catch (err) {
        warn(`[notifyWmsEvent] 호출 실패 (무시): ${err.message}`);
    }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials in .env file.');
    console.error('   Required: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
});

// ------------------------------------------------------------
// 1. 내부 상태
// ------------------------------------------------------------
/** @type {Map<string, import('node-cron').ScheduledTask>} jobId -> cron task */
const cronTasks = new Map();

/** @type {Set<string>} 현재 실행 중인 jobId 들 (중복 실행 방지) */
const runningJobs = new Set();

// ------------------------------------------------------------
// 2. 로그 헬퍼
// ------------------------------------------------------------
const ts = () => new Date().toISOString();
const log = (...args) => console.log(`[${ts()}]`, ...args);
const warn = (...args) => console.warn(`[${ts()}] ⚠️`, ...args);
const error = (...args) => console.error(`[${ts()}] 💥`, ...args);

// ------------------------------------------------------------
// 3. 봇 실행 (스케줄 / 수동 공통)
// ------------------------------------------------------------
async function executeJob(job, { runId = null, triggeredBy = 'schedule', runParams = {} } = {}) {
    // 중복 실행 방지
    if (runningJobs.has(job.id)) {
        warn(`Job '${job.rpa_name}' is already running — skipping ${triggeredBy} trigger`);
        if (runId) {
            // pending 으로 들어온 수동 trigger 였다면 skip 표시
            await supabase
                .from('rpa_runs')
                .update({
                    status: 'failed',
                    finished_at: ts(),
                    error_message: '이전 실행이 아직 진행 중이라 이번 trigger 는 무시되었습니다.',
                })
                .eq('id', runId);
        }
        return;
    }

    if (!job.script_command) {
        warn(`Job '${job.rpa_name}' has no script_command — skipping`);
        return;
    }

    runningJobs.add(job.id);
    let activeRunId = runId;

    try {
        // 3-1) rpa_runs 상태 전이
        if (activeRunId) {
            // 수동 trigger: 이미 pending row 가 있으니 update
            await supabase
                .from('rpa_runs')
                .update({
                    status: 'running',
                    started_at: ts(),
                })
                .eq('id', activeRunId);
        } else {
            // 스케줄 trigger: 새 row insert
            const { data, error: insertErr } = await supabase
                .from('rpa_runs')
                .insert({
                    definition_id: job.id,
                    status: 'running',
                    triggered_by: triggeredBy,
                    started_at: ts(),
                    params: {},
                })
                .select('id')
                .single();
            if (insertErr) throw insertErr;
            activeRunId = data.id;
        }

        // 3-2) rpa_jobs.status = running
        await supabase
            .from('rpa_jobs')
            .update({ status: 'running' })
            .eq('id', job.id);

        // 3-3) rpa_runs.params → CLI 인수 조립 (--key value 형식)
        const paramArgs = Object.entries(runParams)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => `--${k} ${v}`)
            .join(' ');
        const fullCommand = paramArgs
            ? `${job.script_command} ${paramArgs}`
            : job.script_command;

        log(`🚀 [${triggeredBy}] Executing: ${job.rpa_name}`);
        log(`   command: ${fullCommand}`);

        // child process 실행
        const cwd = job.working_dir
            ? path.resolve(PROJECT_ROOT, job.working_dir)
            : PROJECT_ROOT;

        const result = await runChildProcess(fullCommand, cwd);

        const finalStatus = result.exitCode === 0 ? 'success' : 'failed';

        // 3-4) 결과 기록
        await supabase
            .from('rpa_runs')
            .update({
                status: finalStatus,
                finished_at: ts(),
                exit_code: result.exitCode,
                stdout_log: result.stdout.slice(-50000), // 마지막 50K 만 보관
                stderr_log: result.stderr.slice(-10000),
                error_message: finalStatus === 'failed'
                    ? (result.stderr.split('\n').slice(-3).join('\n').trim() || `Exit code ${result.exitCode}`)
                    : null,
            })
            .eq('id', activeRunId);

        await supabase
            .from('rpa_jobs')
            .update({
                status: finalStatus === 'success' ? 'idle' : 'error',
                last_run_at: ts(),
            })
            .eq('id', job.id);

        log(`${finalStatus === 'success' ? '✅' : '❌'} ${job.rpa_name} finished (exit ${result.exitCode})`);

        // WMS 결품 추출 성공 시 → brand/vendor 매칭 알림
        if (finalStatus === 'success' && job.script_command?.includes('wms_extract')) {
            await notifyWmsEvent('wms_complete', { job_name: job.rpa_name });
        }
    } catch (err) {
        error(`Error executing ${job.rpa_name}: ${err.message}`);
        if (activeRunId) {
            await supabase
                .from('rpa_runs')
                .update({
                    status: 'failed',
                    finished_at: ts(),
                    error_message: err.message,
                })
                .eq('id', activeRunId)
                .catch(() => { /* swallow */ });
        }
        await supabase
            .from('rpa_jobs')
            .update({ status: 'error', last_run_at: ts() })
            .eq('id', job.id)
            .catch(() => { /* swallow */ });
    } finally {
        runningJobs.delete(job.id);
    }
}

/**
 * shell 통해 명령 실행 + stdout/stderr 캡처
 * 타임아웃(기본 30분) 초과 시 강제 종료하여 좀비 프로세스 방지
 */
const CHILD_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;   // 30분

function runChildProcess(command, cwd, timeoutMs = CHILD_PROCESS_TIMEOUT_MS) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const proc = spawn(command, [], {
            cwd,
            shell: true,
            env: { ...process.env },
            windowsHide: true,
        });

        // 타임아웃 가드 — 일정 시간 초과 시 강제 종료
        const killTimer = setTimeout(() => {
            timedOut = true;
            warn(`Child process timeout (${timeoutMs}ms) → killing pid=${proc.pid}`);
            try {
                proc.kill('SIGTERM');
                // 5초 후에도 안 죽으면 SIGKILL
                setTimeout(() => {
                    if (!proc.killed) {
                        try { proc.kill('SIGKILL'); } catch (_) {}
                    }
                }, 5000);
            } catch (e) {
                warn(`Failed to kill child process: ${e.message}`);
            }
        }, timeoutMs);

        proc.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            process.stdout.write(`  | ${text}`); // 실시간 미러링 (들여쓰기)
        });
        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            process.stderr.write(`  ! ${text}`);
        });

        proc.on('close', (code) => {
            clearTimeout(killTimer);
            if (timedOut) {
                stderr += `\n[timeout] 프로세스가 ${timeoutMs}ms 를 초과하여 강제 종료되었습니다.`;
            }
            resolve({ exitCode: code ?? -1, stdout, stderr });
        });
        proc.on('error', (err) => {
            clearTimeout(killTimer);
            resolve({
                exitCode: -1,
                stdout,
                stderr: stderr + `\n[spawn error] ${err.message}`,
            });
        });
    });
}

// ------------------------------------------------------------
// 4. cron 등록 / 해제
// ------------------------------------------------------------
function unregisterCron(jobId) {
    const task = cronTasks.get(jobId);
    if (task) {
        task.stop();
        cronTasks.delete(jobId);
        log(`🗑️  Unregistered cron for job ${jobId}`);
    }
}

function registerCron(job) {
    // 항상 기존 등록 해제 후 재등록 (멱등성)
    unregisterCron(job.id);

    if (job.runner_type !== 'local') return;
    if (!job.enabled) {
        log(`⏸️  Job '${job.rpa_name}' is disabled — no cron`);
        return;
    }
    if (job.trigger_type !== 'auto') {
        log(`🖐️  Job '${job.rpa_name}' is manual — no cron`);
        return;
    }
    if (!job.cron_expr) {
        warn(`Job '${job.rpa_name}' is auto but has no cron_expr`);
        return;
    }
    if (!cron.validate(job.cron_expr)) {
        warn(`Job '${job.rpa_name}' has invalid cron_expr: ${job.cron_expr}`);
        return;
    }

    const task = cron.schedule(
        job.cron_expr,
        () => {
            log(`⏰ Cron fired: ${job.rpa_name}`);
            executeJob(job, { triggeredBy: 'schedule' });
        },
        { timezone: 'Asia/Seoul' }
    );

    cronTasks.set(job.id, task);
    log(`✅ Registered cron for '${job.rpa_name}': "${job.cron_expr}"`);
}

// ------------------------------------------------------------
// 5. 초기 로드 — runner_type='local' 봇 전부 cron 등록
// ------------------------------------------------------------
async function loadAllJobs() {
    const { data, error: fetchErr } = await supabase
        .from('rpa_jobs')
        .select('*')
        .eq('runner_type', 'local');
    if (fetchErr) {
        error('Failed to load jobs:', fetchErr.message);
        return;
    }
    log(`📚 Loaded ${data.length} local job(s) from rpa_jobs`);
    data.forEach(registerCron);
}

// ------------------------------------------------------------
// 6. Realtime 구독
// ------------------------------------------------------------
function subscribeRealtime() {
    // 6-1) rpa_jobs 변경 → cron 재등록
    supabase
        .channel('worker_rpa_jobs')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rpa_jobs' },
            async (payload) => {
                const evt = payload.eventType;
                log(`📡 rpa_jobs ${evt}`);

                if (evt === 'DELETE') {
                    unregisterCron(payload.old.id);
                    return;
                }

                // INSERT / UPDATE — 최신 row 다시 가져와 등록
                const targetId = payload.new?.id;
                if (!targetId) return;

                const { data } = await supabase
                    .from('rpa_jobs')
                    .select('*')
                    .eq('id', targetId)
                    .single();

                if (data) registerCron(data);
            }
        )
        .subscribe();

    // 6-2) rpa_runs INSERT (status='pending') → 즉시 실행 (수동 trigger)
    supabase
        .channel('worker_rpa_runs_pending')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'rpa_runs',
                filter: 'status=eq.pending',
            },
            async (payload) => {
                const runId = payload.new.id;
                const defId = payload.new.definition_id;
                log(`📡 Manual trigger detected (run ${runId})`);

                if (!defId) {
                    warn(`Run ${runId} has no definition_id — skipping`);
                    return;
                }

                const { data: job } = await supabase
                    .from('rpa_jobs')
                    .select('*')
                    .eq('id', defId)
                    .single();

                if (!job) {
                    warn(`Could not find job ${defId} for run ${runId}`);
                    return;
                }

                if (job.runner_type !== 'local') {
                    // 다른 runner (예: github_actions) 가 처리할 것
                    log(`Skipping run ${runId} — runner_type='${job.runner_type}' is not local`);
                    return;
                }

                executeJob(job, {
                    runId,
                    triggeredBy: payload.new.triggered_by || 'manual',
                    runParams: payload.new.params || {},
                });
            }
        )
        .subscribe();

    log('📡 Realtime subscribed: rpa_jobs(*), rpa_runs(INSERT pending)');
}

// ------------------------------------------------------------
// 7. 메인 + 종료 처리
// ------------------------------------------------------------
async function main() {
    log('===== LetusLogis Local RPA Worker START =====');
    log(`Project root: ${PROJECT_ROOT}`);
    log(`Timezone    : Asia/Seoul`);

    await loadAllJobs();
    subscribeRealtime();

    // WMS 결품 미확인 30분 주기 체크
    cron.schedule('*/30 * * * *', () => {
        log('⏰ WMS 미확인 체크 실행');
        notifyWmsEvent('wms_check_pending');
    }, { timezone: 'Asia/Seoul' });
    log('⏰ WMS 미확인 체크 등록: 30분 주기');


    log('🟢 Worker is running. Press Ctrl+C to stop.');
}

function shutdown(signal) {
    log(`🛑 ${signal} received — stopping all cron jobs and exiting...`);
    cronTasks.forEach((task) => task.stop());
    cronTasks.clear();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (err) => {
    error('Unhandled promise rejection:', err);
});

main().catch((err) => {
    error('Fatal error in main():', err);
    process.exit(1);
});
