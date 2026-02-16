
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
    // 1. Get Valid Target Company ID from a sample staff (e.g., '城間' or just the first one)
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;
    if (!staffList || staffList.length === 0) throw new Error('No staff found to get company_id');

    // Detect Name Column
    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k)) || 'id';

    // Pick a target company_id. Prefer one that is not null.
    const targetCompStaff = staffList.find((s: any) => s.company_id) || staffList[0];
    const TARGET_COMPANY_ID = targetCompStaff.company_id;

    if (!TARGET_COMPANY_ID) throw new Error('Could not determine target company_id from staff table');

    // 2. Build Maps
    const normalize = (s: string) => s ? String(s).replace(/\s+/g, '').toLowerCase() : '';

    // New Staff Map: Normalized Name -> New ID
    const nameToNewId = new Map();
    staffList.forEach((s: any) => {
        const norm = normalize(s[nameColumn]);
        if (norm) nameToNewId.set(norm, s.id);
    });

    // Old Staff Map: Old ID -> Normalized Name (From timecards table)
    const { data: oldTimecards, error: oldError } = await supabase.from('timecards').select('*');
    if (oldError) throw oldError;

    // Map Old ID to Name(s) - Try multiple fields
    const oldIdToName = new Map();
    oldTimecards.forEach((card: any) => {
        // Collect potential names
        const names = [card.staff_name, card.name, card.display_name, card.employee_name, card.user_name].filter(Boolean);
        if (names.length > 0) {
            // Store the first valid name found
            oldIdToName.set(card.staff_id, names[0]);
        }
    });

    // 3. Process All Logs
    const { data: allLogs, error: logsError } = await supabase.from('timecard_logs').select('id, staff_id');
    if (logsError) throw logsError;

    let updatedCount = 0;
    const details: any[] = [];

    // We will update logs one by one or in batches.
    for (const log of allLogs) {
        let newStaffId = null;
        let matchMethod = 'none';

        // Attempt 1: Check if log.staff_id is already a New ID (exists in staffList)
        if (staffList.some((s: any) => s.id === log.staff_id)) {
            newStaffId = log.staff_id;
            matchMethod = 'already_new_id';
        }

        // Attempt 2: Treat log.staff_id as Old ID -> Look up Name -> Look up New ID
        if (!newStaffId || matchMethod === 'already_new_id') {
            // Even if matchMethod is already_new_id, we might want to check name match just in case? 
            // No, trust ID if valid.
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
        }

        // Prepare Update Object
        const updatePayload: any = {
            company_id: TARGET_COMPANY_ID // Force overwrite
        };

        if (newStaffId) {
            updatePayload.staff_id = newStaffId;
        }

        // Execute Update
        const { error: updateError } = await supabase
            .from('timecard_logs')
            .update(updatePayload)
            .eq('id', log.id);

        if (!updateError) {
            updatedCount++;
            if (updatedCount <= 10) {
                details.push({ id: log.id, method: matchMethod, new_staff_id: newStaffId, company_updated: true });
            }
        }
    }

    return {
        status: 'Super Force Sync Completed',
        total_logs_processed: allLogs.length,
        total_logs_updated: updatedCount,
        target_company_id: TARGET_COMPANY_ID,
        sample_details: details
    };
}

async function syncCompanyIds(supabase: any) {
    // 1. Fetch Staff
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

    // 2. Fetch OLD Timecards to get the mapping (Old ID -> Name)
    const { data: oldTimecards, error: oldError } = await supabase.from('timecards').select('staff_id, staff_name, name, display_name, user_name, employee_name');
    if (oldError) throw oldError;

    const oldStaffMap = new Map(); // Old ID -> Name List
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

        for (const name of names) { // names is explicitly treated as string[] here because we pushed specific string fields
            // However, typescript might complain if not cast.
            // We'll trust the logic flow from previous proven version.
            const norm = normalize(name as string);
            if (nameToNewStaff.has(norm)) {
                matchedNewStaff = nameToNewStaff.get(norm);
                matchName = name as string;
                break;
            }
        }

        if (matchedNewStaff) {
            // Update using OLD ID match
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
