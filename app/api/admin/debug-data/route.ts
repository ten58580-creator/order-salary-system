
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { parse, addMinutes, format, differenceInMinutes } from 'date-fns';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'check';
    const year = parseInt(searchParams.get('year') || '2026');
    const month = parseInt(searchParams.get('month') || '1');
    const fix = searchParams.get('fix') === 'true'; // Force fix/migrate
    const key = searchParams.get('key'); // Bypass Key
    const serviceKeyInput = searchParams.get('service_key'); // Direct Input for Service Key

    let supabase;
    let userId = 'system_bypass';

    // 1. Check Key FIRST (Bypass Auth & RLS)
    if (key === 'admin123') {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = serviceKeyInput || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    } else {
        // 2. Normal Auth (Session based)
        const cookieStore = await cookies();

        supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                        }
                    },
                },
            }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', details: authError }, { status: 401 });
        }
        userId = user.id;
    }

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = format(new Date(year, month, 0), 'yyyy-MM-dd');

    const results: any = {
        action,
        target: { year, month },
        timestamp: new Date().toISOString(),
        user: userId,
        mode: key === 'admin123' ? 'admin_bypass' : 'authenticated_user',
        env_check: {
            service_role_key_exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            service_key_input_provided: !!serviceKeyInput
        }
    };

    try {
        if (action === 'check') {
            // Check Old Table (Filtered)
            const { count: oldFiltered, data: sampleOld } = await supabase
                .from('timecards')
                .select('*', { count: 'exact' })
                .gte('date', startStr)
                .lte('date', endStr)
                .limit(1);

            // Check Old Table (Total)
            const { count: oldTotal } = await supabase
                .from('timecards')
                .select('*', { count: 'exact', head: true });

            // Check New Table
            const { count: newCount, data: sampleNew } = await supabase
                .from('timecard_logs')
                .select('*', { count: 'exact' })
                .gte('timestamp', `${startStr}T00:00:00`)
                .lte('timestamp', `${endStr}T23:59:59`)
                .limit(1);

            // Check New Table (Total)
            const { count: newTotal } = await supabase
                .from('timecard_logs')
                .select('*', { count: 'exact', head: true });

            results.counts = {
                old_filtered: oldFiltered,
                old_total: oldTotal,
                new_filtered: newCount,
                new_total: newTotal
            };
            results.samples = {
                old: sampleOld?.[0] || null,
                new: sampleNew?.[0] || null
            };

            if (fix || searchParams.get('migrate') === 'true') {
                if ((oldFiltered || 0) > 0 && (newCount || 0) === 0) {
                    results.migration_status = 'Starting Migration...';
                    const mResults = await migrateData(supabase, startStr, endStr);
                    results.migration_result = mResults;
                } else {
                    results.migration_status = 'Skipped: Conditions not met (Old Filtered > 0 AND New Filtered == 0).';
                }
            }

        } else if (action === 'scan') {
            const tables = ['timecards', 'timecard_logs', 'staff', 'companies', 'orders', 'production_records', 'products'];
            const tableCounts: any = {};

            for (const t of tables) {
                const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
                tableCounts[t] = error ? error.message : count;
            }
            results.table_scan = tableCounts;

        } else if (action === 'migrate') {
            const mResults = await migrateData(supabase, startStr, endStr);
            results.migration_result = mResults;

        } else if (action === 'seed') {
            const seedResult = await seedData(supabase, userId, year, month);
            results.seed_result = seedResult;

        } else if (action === 'fix_data') {
            results.fix_result = await fixData(supabase);

        } else if (action === 'fix_salary_data') {
            results.salary_fix_result = await fixSalaryData(supabase, startStr, endStr);
        }

        return NextResponse.json(results);

    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}

// ----------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------

async function fixSalaryData(supabase: any, startStr: string, endStr: string) {
    // 1. Fetch Staff with Error Handling - Fetch ALL columns to inspect
    const { data: staffList, error: staffError } = await supabase
        .from('staff')
        .select('*');

    if (staffError) return { status: 'Error fetching staff', error: staffError };
    if (!staffList || staffList.length === 0) return { status: 'No staff found in database' };

    // Detect Name Column
    const sampleStaff = staffList[0];
    const staffKeys = Object.keys(sampleStaff);
    // Prioritize possible name columns
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k));
    const wageColumn = staffKeys.find(k => ['hourly_wage', 'wage', 'unit_wage', 'salary', 'unit_price'].includes(k));

    // If we can't find a name column, we can't match by name. Return helpful error.
    if (!nameColumn) {
        return {
            status: 'Name column not found in staff table',
            available_columns: staffKeys,
            sample_row: sampleStaff
        };
    }

    // Normalize string for matching (remove spaces, lowercase)
    const normalize = (s: string) => s ? String(s).replace(/\s+/g, '').toLowerCase() : '';

    const staffMapById = new Map();
    const staffMapByName = new Map(); // Normalized Name -> Staff

    staffList.forEach((s: any) => {
        staffMapById.set(s.id, s);
        if (s[nameColumn]) {
            staffMapByName.set(normalize(s[nameColumn]), s);
        }
    });

    // 2. Fetch OLD Timecards to get Names
    const { data: oldTimecards, error: timecardsError } = await supabase.from('timecards')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr);

    if (timecardsError) return { status: 'Error fetching timecards', error: timecardsError };
    if (!oldTimecards || oldTimecards.length === 0) return { status: 'No old timecards found' };

    let updatedCount = 0;
    const reportMap = new Map(); // Staff Name -> { hours, wage }
    const unmatched: any[] = [];
    const debugSampleMatches: any[] = [];

    for (const card of oldTimecards) {
        let staff = staffMapById.get(card.staff_id);
        let matchMethod = 'ID';

        // If ID mismatch or not found, try Name Match
        if (!staff) {
            // Try various name columns that might exist in old schema
            const candidateNames = [
                card.staff_name,
                card.name,
                card.display_name,
                card.user_name,
                card.username,
                card.employee_name,
                // fallback if column match failed
                card[nameColumn]
            ];

            for (const name of candidateNames) {
                if (name) {
                    const matched = staffMapByName.get(normalize(name));
                    if (matched) {
                        staff = matched;
                        matchMethod = `Name(${name})`;
                        break;
                    }
                }
            }
        }

        if (staff) {
            if (debugSampleMatches.length < 5) debugSampleMatches.push({ card_id: card.id, staff: staff[nameColumn], method: matchMethod });

            // Calculate work minutes for this card
            const workMins = calculateWorkMinutes(card.clock_in, card.clock_out, card.break_minutes);
            const hourlyWage = wageColumn ? (staff[wageColumn] || 0) : 0;
            const wage = Math.floor((workMins / 60) * hourlyWage);

            // Update Timecard Logs with Correct Staff ID & Company ID
            const dayStart = `${card.date}T00:00:00`;
            const dayEnd = `${card.date}T23:59:59`;

            const { error: updateError } = await supabase
                .from('timecard_logs')
                .update({
                    staff_id: staff.id,
                    company_id: staff.company_id
                })
                .eq('staff_id', card.staff_id) // Match logs by OLD ID
                .gte('timestamp', dayStart)
                .lte('timestamp', dayEnd);

            if (!updateError) {
                // Add to report
                if (!reportMap.has(staff.id)) {
                    reportMap.set(staff.id, {
                        name: staff[nameColumn],
                        total_minutes: 0,
                        total_wage: 0
                    });
                }
                const entry = reportMap.get(staff.id);
                entry.total_minutes += workMins;
                entry.total_wage += wage;
                updatedCount++;
            }
        } else {
            if (unmatched.length < 10) {
                unmatched.push({
                    card_id: card.id,
                    staff_id_old: card.staff_id,
                    raw_card_keys: Object.keys(card)
                });
            }
        }
    }

    // Format Report
    const formattedReport = Array.from(reportMap.values()).map((r: any) => ({
        "氏名": r.name,
        "合計労働時間": `${Math.floor(r.total_minutes / 60)}時間${r.total_minutes % 60}分`,
        "支給額": `¥${r.total_wage.toLocaleString()}`
    }));

    return {
        status: 'Success',
        staff_count: staffList.length,
        timecards_processed: oldTimecards.length,
        updated_count: updatedCount,
        report: formattedReport,
        debug_matches: debugSampleMatches,
        unmatched_samples: unmatched,
        detected_columns: {
            name: nameColumn,
            wage: wageColumn
        }
    };
}

function calculateWorkMinutes(inStr: string, outStr: string, breakMins: number = 0) {
    if (!inStr || !outStr) return 0;
    try {
        const toMins = (s: string) => {
            // Handle "HH:mm" or ISO
            const timePart = s.includes('T') ? s.split('T')[1].substring(0, 5) : s.substring(0, 5);
            const [h, m] = timePart.split(':').map(Number);
            return h * 60 + m;
        }
        let start = toMins(inStr);
        let end = toMins(outStr);
        return Math.max(0, (end - start) - (breakMins || 0));
    } catch { return 0; }
}

async function fixData(supabase: any) {
    return { status: "Please use fix_salary_data for improved logic" };
}

async function migrateData(supabase: any, startStr: string, endStr: string) {
    const { data: oldData, error: oldError } = await supabase
        .from('timecards')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr);

    if (oldError) throw oldError;
    if (!oldData || oldData.length === 0) return { status: 'No data to migrate', count: 0 };

    // Prefetch staff company map
    const { data: staffList } = await supabase.from('staff').select('id, company_id');
    const staffMap = new Map();
    staffList?.forEach((s: any) => staffMap.set(s.id, s.company_id));

    const logsToInsert: any[] = [];
    const errors: any[] = [];

    for (const card of oldData) {
        if (!card.clock_in || !card.clock_out) continue;

        const companyId = staffMap.get(card.staff_id);

        try {
            const date = card.date;
            const parseTime = (timeStr: string) => {
                if (timeStr.length === 5) return parse(`${date} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date());
                return new Date(timeStr.includes('T') ? timeStr : `${date}T${timeStr}`);
            };

            const inTime = parseTime(card.clock_in);
            const outTime = parseTime(card.clock_out);

            if (isNaN(inTime.getTime()) || isNaN(outTime.getTime())) {
                errors.push({ id: card.id, msg: 'Invalid time' });
                continue;
            }

            logsToInsert.push({
                staff_id: card.staff_id,
                company_id: companyId,
                event_type: 'clock_in',
                timestamp: inTime.toISOString()
            });

            if (card.break_minutes && card.break_minutes > 0) {
                let breakStart = parse(`${date} 12:00`, 'yyyy-MM-dd HH:mm', new Date());
                if (breakStart < inTime || breakStart > outTime) {
                    const mid = (inTime.getTime() + outTime.getTime()) / 2;
                    breakStart = new Date(mid);
                }
                const breakEnd = addMinutes(breakStart, card.break_minutes);

                logsToInsert.push({
                    staff_id: card.staff_id,
                    company_id: companyId,
                    event_type: 'break_start',
                    timestamp: breakStart.toISOString()
                });
                logsToInsert.push({
                    staff_id: card.staff_id,
                    company_id: companyId,
                    event_type: 'break_end',
                    timestamp: breakEnd.toISOString()
                });
            }

            logsToInsert.push({
                staff_id: card.staff_id,
                company_id: companyId,
                event_type: 'clock_out',
                timestamp: outTime.toISOString()
            });

        } catch (e: any) {
            errors.push({ id: card.id, msg: e.message });
        }
    }

    if (logsToInsert.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < logsToInsert.length; i += batchSize) {
            const batch = logsToInsert.slice(i, i + batchSize);
            const { error: insertError } = await supabase.from('timecard_logs').insert(batch);
            if (insertError) throw insertError;
        }
    }

    return {
        status: 'Migrated',
        found_old: oldData.length,
        logs_generated: logsToInsert.length,
        errors
    };
}

async function seedData(supabase: any, _userId: string, year: number, month: number) {
    const { data: staff } = await supabase.from('staff').select('id, company_id').limit(1).single();
    if (!staff) return { status: 'No staff found' };

    const logs = [];
    for (let d = 5; d <= 6; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        logs.push(
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'clock_in', timestamp: `${dateStr}T09:00:00` },
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'break_start', timestamp: `${dateStr}T12:00:00` },
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'break_end', timestamp: `${dateStr}T13:00:00` },
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'clock_out', timestamp: `${dateStr}T18:00:00` }
        );
    }

    const { error } = await supabase.from('timecard_logs').insert(logs);
    if (error) throw error;

    return { status: 'Seeded', count: logs.length, staff_id: staff.id };
}
