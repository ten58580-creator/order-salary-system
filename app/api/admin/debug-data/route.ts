
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
    // 1. Get 株式会社TEN&A Company ID
    let TARGET_COMPANY_ID: string | null = null;
    let targetCompanyName = 'Unknown';
    let source = 'Unknown';

    const { data: companies, error: compError } = await supabase.from('companies').select('*');
    if (compError) throw compError;

    if (companies) {
        // Priority 1: Exact Match for "株式会社TEN&A"
        let target = companies.find((c: any) => c.name === '株式会社TEN&A');

        // Priority 2: Contains "TEN&A"
        if (!target) {
            target = companies.find((c: any) => c.name && c.name.includes('TEN&A'));
        }

        // Priority 3: Contains "TEN" but NOT "A" (to avoid A社 if it contains "TEN" for some reason, though unlikely)
        // Just stick to TEN&A as requested.

        if (target) {
            TARGET_COMPANY_ID = target.id;
            targetCompanyName = target.name;
            source = 'Company Name Search (株式会社TEN&A)';
        }
    }

    if (!TARGET_COMPANY_ID) throw new Error('CRITICAL: Could not find company "株式会社TEN&A". Please ensure it is registered.');

    // 2. Prepare Staff Maps & UNIFY STAFF to Target Company
    // We must ensure the staff (Jomama etc) are ALSO in this company, otherwise they won't appear.
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;

    // Detect Name Column
    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k)) || 'id';

    const normalize = (s: string) => s ? String(s).replace(/\s+/g, '').toLowerCase() : '';

    // Map of Normalized Name -> Master Staff ID
    const nameToNewId = new Map();
    let staffUpdatedCount = 0;

    // 2a. Update Staff to Target Company if they are 'Shirokama' or 'Janani' etc.
    // Actually, we should probably update ALL staff found in current context that match the logs?
    // Let's rely on name matching.

    for (const s of staffList) {
        const norm = normalize(s[nameColumn]);
        if (norm) {
            nameToNewId.set(norm, s.id);

            // CRITICAL: Move this staff to TEN&A if not already
            if (s.company_id !== TARGET_COMPANY_ID) {
                await supabase.from('staff').update({ company_id: TARGET_COMPANY_ID }).eq('id', s.id);
                staffUpdatedCount++;
            }
        }
    }

    // Old Staff Map for linking old IDs
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

        // Find Name
        let staffName = '';

        // Try to identify staff name from current ID match
        const existingStaff = staffList.find((s: any) => s.id === log.staff_id);
        if (existingStaff) {
            staffName = existingStaff[nameColumn];
        } else {
            // Try old map
            const oldName = oldIdToName.get(log.staff_id);
            if (oldName) staffName = oldName;
        }

        // Resolve to Master ID in New Company
        if (staffName) {
            const norm = normalize(staffName);
            if (nameToNewId.has(norm)) {
                newStaffId = nameToNewId.get(norm);
                matchMethod = existingStaff ? 'direct_id_verified' : 'relieved_by_name';
            }
        }

        // If we still don't have a new ID but the log has an ID, check if we simply trust it (if we moved the staff already)
        if (!newStaffId && existingStaff) {
            newStaffId = log.staff_id; // Keep existing if name match failed but ID valid
            matchMethod = 'keep_existing_id';
        }

        const updatePayload: any = {
            company_id: TARGET_COMPANY_ID // UNCONDITIONAL OVERWRITE to TEN&A
        };
        // Also update staff_id if we found a better match (Master ID)
        if (newStaffId) updatePayload.staff_id = newStaffId;

        const { error: updateError } = await supabase
            .from('timecard_logs')
            .update(updatePayload)
            .eq('id', log.id);

        if (!updateError) {
            updatedCount++;
            if (updatedCount <= 10) details.push({ id: log.id, method: matchMethod, new_staff_id: newStaffId, name: staffName });
        }
    }

    return {
        status: 'Super Force Sync Completed (Migration to TEN&A)',
        target_company: targetCompanyName,
        target_company_id: TARGET_COMPANY_ID,
        source_logic: 'Full Migration (Staff + Logs)',
        total_logs_processed: allLogs.length,
        total_logs_updated: updatedCount,
        staff_moved_to_company: staffUpdatedCount,
        debug: {
            staff_found: staffList.length,
            old_timecards_found: oldTimecards ? oldTimecards.length : 0,
            companies_scanned: companies ? companies.length : 0
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
