
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
    console.log('Starting Stepwise Insert Test...');

    // 1. Company
    console.log('1. Inserting Company...');
    const { data: comp, error: cErr } = await supabase.from('companies').insert({
        name: 'Debug Company ' + Date.now(),
        address: 'Test Address',
        contact_info: 'Test Contact'
    }).select('id').single();
    if (cErr) {
        console.error('Company Fail:', JSON.stringify(cErr, null, 2));
        return;
    }
    const companyId = comp.id;
    console.log('Company OK:', companyId);

    // 2. Staff
    console.log('2. Inserting Staff...');
    const { data: staff, error: sErr } = await supabase.from('staff').insert({
        name: 'Debug Staff ' + Date.now(),
        company_id: companyId,
        hourly_wage: 1000,
        role: 'staff'
    }).select('id').single();
    if (sErr) {
        console.error('Staff Fail:', JSON.stringify(sErr, null, 2));
        return;
    }
    const staffId = staff.id;
    console.log('Staff OK:', staffId);

    // 3. Product
    console.log('3. Inserting Product...');
    const { data: prod, error: pErr } = await supabase.from('products').insert({
        name: 'Debug Product',
        company_id: companyId,
        unit_price: 100
    }).select('id').single();
    if (pErr) {
        console.error('Product Fail:', JSON.stringify(pErr, null, 2));
        return;
    }
    const productId = prod.id;
    console.log('Product OK:', productId);

    // 4. Order
    console.log('4. Inserting Order...');
    const { data: order, error: oErr } = await supabase.from('orders').insert({
        company_id: companyId,
        product_id: productId,
        quantity: 10,
        order_date: new Date().toISOString().split('T')[0]
    }).select('id').single();
    if (oErr) {
        console.error('Order Fail:', JSON.stringify(oErr, null, 2));
        return;
    }
    const orderId = order.id;
    console.log('Order OK:', orderId);

    // 5. Production Log
    console.log('5. Inserting Production Log...');
    const now = new Date().toISOString();
    const { data: log, error: lErr } = await supabase.from('production_logs').insert({
        product_id: productId,
        order_date: new Date().toISOString().split('T')[0],
        status: 'processing',
        start_time: now,
        worker_count: 1
    }).select('id').single();
    if (lErr) {
        console.error('Log Fail:', JSON.stringify(lErr, null, 2));
        return;
    }
    console.log('Log OK:', log.id);

    console.log('ALL SUCCESS');
}

main();
