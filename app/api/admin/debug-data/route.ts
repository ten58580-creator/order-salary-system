
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const serviceKeyInput = searchParams.get('service_key');
    const action = searchParams.get('action'); // 'force_link', 'sync_company', 'super_force_sync'

    // Auth Check
    if (key !== 'admin123') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = serviceKeyInput || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        if (action === 'sync_company') {
            const result = await syncCompanyIds(supabase);
            return NextResponse.json(result);
        } else if (action === 'force_link') {
            const result = await forceLinkStaff(supabase);
            return NextResponse.json(result);
        } else if (action === 'super_force_sync') {
            const result = await superForceSync(supabase);
            return NextResponse.json(result);
        } else {
            return NextResponse.json({
                status: 'Debug API Active',
                available_actions: ['force_link', 'sync_company', 'super_force_sync']
            });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}

async function superForceSync(supabase: any) {
    // 1. Get TEN&A Company ID
    let TARGET_COMPANY_ID: string | null = null;
    let targetCompanyName = 'Unknown';
    let source = 'Unknown';

    // Strategy A: Find specific staff '城間' (Shirokama) who represents the correct company
    const { data: shirokama, error: sErr } = await supabase
        .from('staff')
        .select('*')
        .or('display_name.ilike.%城間%,name.ilike.%城間%,full_name.ilike.%城間%')
        .limit(1)
        .single();

    if (shirokama && shirokama.company_id) {
        TARGET_COMPANY_ID = shirokama.company_id;
        targetCompanyName = `Associated with Staff: ${shirokama.display_name || shirokama.name}`;
        source = 'Staff (Shirokama)';
    }

    // Strategy B: If Shirokama not found, look for company "TEN" but EXCLUDE "A社"
    if (!TARGET_COMPANY_ID) {
        const { data: companies, error: compError } = await supabase.from('companies').select('*');
        if (!compError && companies) {
            // Priority 1: Contains 'TEN'
            let target = companies.find((c: any) => c.name && c.name.toUpperCase().includes('TEN'));

            // Priority 2: Not "A社"
            if (!target) {
                target = companies.find((c: any) => c.name && !c.name.includes('A社') && !c.name.includes('Ａ社'));
            }

            if (target) {
                TARGET_COMPANY_ID = target.id;
                targetCompanyName = target.name;
                source = 'Company Search';
            }
        }
    }

    if (!TARGET_COMPANY_ID) {
        // Fallback: Just take the first valid company_id from ANY staff
        const { data: anyStaff } = await supabase.from('staff').select('company_id').not('company_id', 'is', null).limit(1);
        if (anyStaff && anyStaff.length > 0) {
            TARGET_COMPANY_ID = anyStaff[0].company_id;
            targetCompanyName = 'Fallback Staff Company';
            source = 'Any Staff';
        }
    }

    if (!TARGET_COMPANY_ID) throw new Error('CRITICAL: Could not determine TEN&A Company ID. Please ensure staff "城間" exists or a company named "TEN" exists.');

    // 2. Prepare Staff Maps
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;

    // Detect Name Column
    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k)) || 'id';

    const normalize = (s: string) => s ? String(s).replace(/\s+/g, '').toLowerCase() : '';

    const nameToNewId = new Map();
    staffList.forEach((s: any) => {
        const norm = normalize(s[nameColumn]);
        if (norm) nameToNewId.set(norm, s.id);
    });

    // Old Staff Map
    const { data: oldTimecards } = await supabase.from('timecards').select('*');
    const oldIdToName = new Map();
    if (oldTimecards) {
        oldTimecards.forEach((card: any) => {
            const names = [card.staff_name, card.name, card.display_name, card.employee_name, card.user_name].filter(Boolean);
            if (names.length > 0) oldIdToName.set(card.staff_id, names[0]);
        });
    }

    // 3. Process All Logs
    const { data: allLogs, error: logsError } = await supabase.from('timecard_logs').select('id, staff_id');
    if (logsError) throw logsError;

    let updatedCount = 0;
    const details: any[] = [];

    for (const log of allLogs) {
        let newStaffId = null;
        let matchMethod = 'none';

        // Attempt 1: Check if log.staff_id is already a New ID (exists in staffList)
        if (staffList.some((s: any) => s.id === log.staff_id)) {
            newStaffId = log.staff_id;
            matchMethod = 'already_new_id';
        }

        // Attempt 2: Match by Old ID -> Name -> New ID
        if (!newStaffId) {
            const oldName = oldIdToName.get(log.staff_id);
            if (oldName) {
                const norm = normalize(oldName);
                if (nameToNewId.has(norm)) {
                    newStaffId = nameToNewId.get(norm);
                    matchMethod = 'old_id_match';
                }
            }
        }

        const updatePayload: any = {
            company_id: TARGET_COMPANY_ID // UNCONDITIONAL OVERWRITE
        };
        if (newStaffId) updatePayload.staff_id = newStaffId;

        const { error: updateError } = await supabase
            .from('timecard_logs')
            .update(updatePayload)
            .eq('id', log.id);

        if (!updateError) {
            updatedCount++;
            if (updatedCount <= 10) details.push({ id: log.id, method: matchMethod, new_staff_id: newStaffId });
        }
    }

    return {
        status: 'Super Force Sync Completed (Correct Logic)',
        target_company: targetCompanyName,
        target_company_id: TARGET_COMPANY_ID,
        source_logic: source,
        total_logs_processed: allLogs.length,
        total_logs_updated: updatedCount,
        debug: {
            staff_found: staffList.length,
            old_timecards_found: oldTimecards ? oldTimecards.length : 0
        },
        sample_details: details
    };
}

async function syncCompanyIds(supabase: any) {
    // 1. Fetch Staff, selecting ALL columns
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;

    // Detect Name Column
    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k)) || 'id';

    let updatedCount = 0;
    const errors: any[] = [];
    const details: any[] = [];

    // 2. Update timecard_logs
    for (const staff of staffList) {
        if (!staff.company_id) continue;
        const staffName = staff[nameColumn] || staff.id;

        const { count, error } = await supabase
            .from('timecard_logs')
            .update({ company_id: staff.company_id })
            .eq('staff_id', staff.id)
            .select('*', { count: 'exact', head: true });

        if (error) {
            errors.push({ staff: staffName, msg: error.message });
        } else {
            updatedCount += (count || 0);
            details.push({ staff: staffName, count: count, company_id: staff.company_id });
        }
    }

    return {
        status: 'Company ID Sync Completed',
        total_logs_updated: updatedCount,
        details,
        errors
    };
}

async function forceLinkStaff(supabase: any) {
    // 1. Fetch ALL Staff (New IDs)
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;

    // Build Maps for Name Matching
    const normalize = (s: string) => s ? String(s).replace(/\s+/g, '').toLowerCase() : '';
    const nameToNewStaff = new Map();

    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k)) || 'id';

    staffList.forEach((s: any) => {
        const norm = normalize(s[nameColumn]);
        if (norm) nameToNewStaff.set(norm, s);
    });

    // 2. Fetch OLD Timecards
    const { data: oldTimecards, error: oldError } = await supabase.from('timecards').select('*');
    if (oldError) throw oldError;

    const oldStaffMap = new Map();
    oldTimecards.forEach((card: any) => {
        if (!oldStaffMap.has(card.staff_id)) {
            const names = [card.staff_name, card.name, card.display_name, card.user_name, card.employee_name].filter(Boolean);
            oldStaffMap.set(card.staff_id, names);
        }
    });

    const details: any[] = [];
    let updatedGroups = 0;

    // 3. Execute Updates based on Name Matching
    for (const [oldId, names] of oldStaffMap.entries()) {
        let matchedNewStaff = null;
        let matchName = '';

        for (const name of names) {
            const norm = normalize(name as string);
            if (nameToNewStaff.has(norm)) {
                matchedNewStaff = nameToNewStaff.get(norm);
                matchName = name as string;
                break;
            }
        }

        if (matchedNewStaff) {
            const { error: updateError } = await supabase
                .from('timecard_logs')
                .update({
                    staff_id: matchedNewStaff.id,
                    company_id: matchedNewStaff.company_id
                })
                .eq('staff_id', oldId);

            details.push({
                old_id: oldId,
                matched_name: matchName,
                new_id: matchedNewStaff.id,
                result: updateError ? updateError.message : 'Sent update'
            });
            updatedGroups++;
        }
    }

    return {
        status: 'Name Linking Executed',
        matched_groups: updatedGroups,
        details
    };
}
