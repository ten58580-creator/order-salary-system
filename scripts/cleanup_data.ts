
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const env: Record<string, string> = {};
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
            }
        });
        return env;
    } catch (e) { return {}; }
};

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
    console.log('==========================================================');
    console.log('DATA CLEANUP - RESETTING SYSTEM TO CLEAN STATE');
    console.log('==========================================================\n');

    // 1. Delete all timecard_logs
    console.log('STEP 1: Deleting all timecard_logs...');
    const { error: timecardError, count: timecardCount } = await supabase
        .from('timecard_logs')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (timecardError) {
        console.error('  ✗ Error:', timecardError.message);
    } else {
        console.log(`  ✓ Deleted ${timecardCount ?? 0} timecard logs\n`);
    }

    // 2. Delete all production_logs
    console.log('STEP 2: Deleting all production_logs...');
    const { error: productionError, count: productionCount } = await supabase
        .from('production_logs')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (productionError) {
        console.error('  ✗ Error:', productionError.message);
    } else {
        console.log(`  ✓ Deleted ${productionCount ?? 0} production logs\n`);
    }

    // 3. Reset all orders to 'not_started' status
    console.log('STEP 3: Resetting all orders to not_started...');
    const { error: ordersError, count: ordersCount } = await supabase
        .from('orders')
        .update({
            status: 'not_started',
            actual_quantity: 0,
            worker_count: 0
        }, { count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all

    if (ordersError) {
        console.error('  ✗ Error:', ordersError.message);
    } else {
        console.log(`  ✓ Reset ${ordersCount ?? 0} orders to not_started\n`);
    }

    // 4. Verification
    console.log('==========================================================');
    console.log('VERIFICATION');
    console.log('==========================================================\n');

    const { count: remainingTimecard } = await supabase
        .from('timecard_logs')
        .select('*', { count: 'exact', head: true });

    const { count: remainingProduction } = await supabase
        .from('production_logs')
        .select('*', { count: 'exact', head: true });

    const { data: orderStatuses } = await supabase
        .from('orders')
        .select('status')
        .neq('status', 'not_started');

    console.log(`Remaining timecard_logs: ${remainingTimecard ?? 0}`);
    console.log(`Remaining production_logs: ${remainingProduction ?? 0}`);
    console.log(`Orders not in not_started status: ${orderStatuses?.length ?? 0}`);

    if ((remainingTimecard ?? 0) === 0 &&
        (remainingProduction ?? 0) === 0 &&
        (orderStatuses?.length ?? 0) === 0) {
        console.log('\n✓ CLEANUP SUCCESSFUL - System is now in clean state');
    } else {
        console.log('\n⚠ CLEANUP INCOMPLETE - Some data may remain');
    }

    console.log('==========================================================');
}

main().catch(console.error);
