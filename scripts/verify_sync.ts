
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
    console.log('='.repeat(60));
    console.log('DATA VERIFICATION REPORT');
    console.log('='.repeat(60));

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Check Production Logs
    console.log('\n1. PRODUCTION LOGS');
    console.log('-'.repeat(60));
    const { data: logs } = await supabase
        .from('production_logs')
        .select('product_id, start_time, end_time, worker_count, products(name)')
        .eq('order_date', todayStr)
        .order('start_time');

    let totalMinutes = 0;
    logs?.forEach(log => {
        const start = new Date(log.start_time);
        const end = new Date(log.end_time);
        const minutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
        totalMinutes += minutes * (log.worker_count || 1);

        console.log(`商品: ${(log.products as any)?.name}`);
        console.log(`  時刻: ${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        console.log(`  作業時間: ${minutes}分 (${(minutes / 60).toFixed(2)}時間)`);
        console.log(`  作業者数: ${log.worker_count}名`);
        console.log(`  人時: ${(minutes * (log.worker_count || 1) / 60).toFixed(2)}時間`);
        console.log('');
    });

    // 2. Check Orders
    console.log('2. ORDERS');
    console.log('-'.repeat(60));
    const { data: orders } = await supabase
        .from('orders')
        .select('product_id, quantity, actual_quantity, status, products(name)')
        .eq('order_date', todayStr);

    let totalQty = 0;
    orders?.forEach(order => {
        totalQty += order.actual_quantity || 0;
        console.log(`商品: ${(order.products as any)?.name}`);
        console.log(`  数量: ${order.quantity} → 実績: ${order.actual_quantity}`);
        console.log(`  ステータス: ${order.status}`);
        console.log('');
    });

    // 3. Check Timecard Logs
    console.log('3. TIMECARD LOGS');
    console.log('-'.repeat(60));
    const { data: timecards } = await supabase
        .from('timecard_logs')
        .select('staff_id, event_type, timestamp, staff(name)')
        .gte('timestamp', `${todayStr}T00:00:00`)
        .lte('timestamp', `${todayStr}T23:59:59`)
        .order('staff_id')
        .order('timestamp');

    const staffHours = new Map<string, { name: string, minutes: number }>();
    let currentStaff: string | null = null;
    let clockInTime: Date | null = null;

    timecards?.forEach(tc => {
        const staffName = (tc.staff as any)?.name || 'Unknown';

        if (tc.event_type === 'clock_in') {
            currentStaff = tc.staff_id;
            clockInTime = new Date(tc.timestamp);
        } else if (tc.event_type === 'clock_out' && currentStaff === tc.staff_id && clockInTime) {
            const clockOutTime = new Date(tc.timestamp);
            const minutes = Math.floor((clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60));

            if (!staffHours.has(tc.staff_id)) {
                staffHours.set(tc.staff_id, { name: staffName, minutes: 0 });
            }
            const data = staffHours.get(tc.staff_id)!;
            data.minutes += minutes;
        }
    });

    let totalStaffMinutes = 0;
    staffHours.forEach((data, staffId) => {
        totalStaffMinutes += data.minutes;
        console.log(`スタッフ: ${data.name}`);
        console.log(`  労働時間: ${data.minutes}分 (${(data.minutes / 60).toFixed(2)}時間)`);
        console.log(`  給与: ¥${Math.floor(data.minutes * (1100 / 60)).toLocaleString()}`);
        console.log('');
    });

    // 4. Summary
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`総労働時間（タイムカード）: ${(totalStaffMinutes / 60).toFixed(2)}時間`);
    console.log(`総人件費: ¥${Math.floor(totalStaffMinutes * (1100 / 60)).toLocaleString()}`);
    console.log(`総製造数: ${totalQty}個`);
    console.log(`平均人件費/個: ¥${(Math.floor(totalStaffMinutes * (1100 / 60)) / totalQty).toFixed(2)}`);
    console.log('='.repeat(60));
}

main().catch(console.error);
